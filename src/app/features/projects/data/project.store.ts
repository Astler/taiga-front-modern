import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthTokenStorage } from '../../../core/auth';
import { PinnedProjectsApiService } from './pinned-projects-api.service';
import { PinnedProjectsStorage, deduplicatePins, pinKey } from './pinned-projects.storage';
import { ProjectApiService } from './project-api.service';
import {
  type ProjectLocator,
  type ProjectPin,
  type ProjectStoreError,
  type TaigaProjectDetail,
  type TaigaProjectListItem,
  isProjectDetail,
} from './project.models';

@Injectable({ providedIn: 'root' })
export class ProjectStore {
  private readonly authTokens = inject(AuthTokenStorage);
  private readonly api = inject(ProjectApiService);
  private readonly pinnedApi = inject(PinnedProjectsApiService);
  private readonly pinnedStorage = inject(PinnedProjectsStorage);
  private readonly projectsState = signal<readonly TaigaProjectListItem[]>([]);
  private readonly selectedProjectState = signal<TaigaProjectDetail | null>(null);
  private readonly pinsState = signal<readonly ProjectPin[]>([]);
  private readonly loadingState = signal(false);
  private readonly projectsLoadedState = signal(false);
  private readonly errorState = signal<ProjectStoreError | null>(null);
  private pendingRequests = 0;
  private listRevision = 0;
  private selectionRevision = 0;
  private pinsRevision = 0;
  private pendingSelectionRequests = 0;
  private memberId: number | null = null;
  private memberSessionRevision: number | null = null;
  private memberRevision = 0;
  private remotePinsLoadRevision = -1;
  private remotePinsLoad: Promise<void> | null = null;
  private remoteSaveQueueRevision = -1;
  private remoteSaveQueue: Promise<void> = Promise.resolve();

  readonly projects = this.projectsState.asReadonly();
  readonly selectedProject = this.selectedProjectState.asReadonly();
  readonly pins = this.pinsState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly projectsLoaded = this.projectsLoadedState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly pinnedProjects = computed(() =>
    this.projectsState().filter((project) => this.isPinned(project)),
  );
  readonly unpinnedProjects = computed(() =>
    this.projectsState().filter((project) => !this.isPinned(project)),
  );

  async loadMemberProjects(memberId: number): Promise<readonly TaigaProjectListItem[]> {
    const sessionRevision = this.authTokens.revision();
    this.activateMember(memberId, sessionRevision);

    const revision = ++this.listRevision;
    const memberRevision = this.memberRevision;
    this.beginRequest();
    if (this.errorState()?.operation !== 'select') {
      this.errorState.set(null);
    }

    let projects: readonly TaigaProjectListItem[];
    try {
      [projects] = await Promise.all([
        firstValueFrom(this.api.listByMember(memberId)),
        this.loadRemotePinsOnce(memberId, memberRevision, sessionRevision),
      ]);
      if (
        !this.isCurrentMember(memberId, memberRevision, sessionRevision) ||
        revision !== this.listRevision
      ) {
        return projects;
      }
      this.projectsState.set(projects);
      this.projectsLoadedState.set(true);
    } catch (cause: unknown) {
      if (
        this.isCurrentMember(memberId, memberRevision, sessionRevision) &&
        revision === this.listRevision
      ) {
        this.errorState.set({ operation: 'list', cause });
      }
      throw cause;
    } finally {
      this.endRequest();
    }

    if (
      !this.isCurrentMember(memberId, memberRevision, sessionRevision) ||
      revision !== this.listRevision
    ) {
      return projects;
    }

    if (
      this.selectedProjectState() === null &&
      this.pendingSelectionRequests === 0 &&
      this.errorState()?.operation !== 'select'
    ) {
      const firstProject = this.pinnedProjects()[0] ?? projects[0];
      if (firstProject) {
        await this.selectBySlug(firstProject.slug);
      } else {
        this.clearSelection();
      }
    }

    return projects;
  }

  selectProject(project: TaigaProjectListItem | TaigaProjectDetail): Promise<TaigaProjectDetail> {
    if (isProjectDetail(project)) {
      ++this.selectionRevision;
      this.selectedProjectState.set(project);
      this.errorState.set(null);
      return Promise.resolve(project);
    }
    return this.selectBySlug(project.slug);
  }

  selectBySlug(slug: string): Promise<TaigaProjectDetail> {
    const normalizedSlug = slug.trim();
    if (!normalizedSlug) {
      return Promise.reject(new Error('Project slug must not be empty.'));
    }

    const current = this.selectedProjectState();
    if (current?.slug === normalizedSlug) {
      return Promise.resolve(current);
    }
    return this.loadSelection(() => this.api.getBySlug(normalizedSlug));
  }

  selectById(projectId: number): Promise<TaigaProjectDetail> {
    const current = this.selectedProjectState();
    if (current?.id === projectId) {
      return Promise.resolve(current);
    }
    return this.loadSelection(() => this.api.getById(projectId));
  }

  clearSelection(): void {
    ++this.selectionRevision;
    this.selectedProjectState.set(null);
  }

  isPinned(locator: ProjectLocator): boolean {
    const identities = locatorPins(locator);
    return this.pinsState().some((pin) => identities.some((identity) => pinsEqual(pin, identity)));
  }

  pin(locator: ProjectLocator): void {
    const identity = preferredPin(locator);
    if (!identity || this.isPinned(locator)) {
      return;
    }
    this.persistPins([...this.pinsState(), identity]);
  }

  unpin(locator: ProjectLocator): void {
    const identities = locatorPins(locator);
    if (!identities.length) {
      return;
    }
    this.persistPins(
      this.pinsState().filter((pin) => !identities.some((identity) => pinsEqual(pin, identity))),
    );
  }

  togglePin(locator: ProjectLocator): void {
    if (this.isPinned(locator)) {
      this.unpin(locator);
    } else {
      this.pin(locator);
    }
  }

  private async loadSelection(
    request: () => ReturnType<ProjectApiService['getBySlug']>,
  ): Promise<TaigaProjectDetail> {
    const revision = ++this.selectionRevision;
    this.pendingSelectionRequests += 1;
    this.beginRequest();
    this.errorState.set(null);

    try {
      const project = await firstValueFrom(request());
      if (revision === this.selectionRevision) {
        this.selectedProjectState.set(project);
      }
      return project;
    } catch (cause: unknown) {
      if (revision === this.selectionRevision) {
        this.errorState.set({ operation: 'select', cause });
      }
      throw cause;
    } finally {
      this.pendingSelectionRequests = Math.max(0, this.pendingSelectionRequests - 1);
      this.endRequest();
    }
  }

  private persistPins(pins: readonly ProjectPin[]): void {
    const normalized = deduplicatePins(pins);
    this.pinsState.set(normalized);
    ++this.pinsRevision;

    const memberId = this.memberId;
    if (memberId === null) {
      return;
    }

    const memberRevision = this.memberRevision;
    const sessionRevision = this.authTokens.revision();
    if (this.memberSessionRevision !== sessionRevision) {
      return;
    }
    this.pinnedStorage.write(memberId, normalized);
    this.queueRemotePinSave(normalized, memberId, memberRevision, sessionRevision);
  }

  private activateMember(memberId: number, sessionRevision: number): void {
    if (this.memberId === memberId && this.memberSessionRevision === sessionRevision) {
      return;
    }

    if (this.memberId !== null) {
      ++this.selectionRevision;
      this.selectedProjectState.set(null);
      this.projectsState.set([]);
      this.projectsLoadedState.set(false);
      this.errorState.set(null);
    }

    this.memberId = memberId;
    this.memberSessionRevision = sessionRevision;
    ++this.memberRevision;
    ++this.pinsRevision;
    this.pinsState.set(this.pinnedStorage.read(memberId));
    this.remotePinsLoadRevision = -1;
    this.remotePinsLoad = null;
  }

  private loadRemotePinsOnce(
    memberId: number,
    memberRevision: number,
    sessionRevision: number,
  ): Promise<void> {
    if (this.remotePinsLoadRevision !== memberRevision) {
      this.remotePinsLoadRevision = memberRevision;
      this.remotePinsLoad = null;
    }
    if (!this.remotePinsLoad) {
      const pinsRevision = this.pinsRevision;
      this.remotePinsLoad = firstValueFrom(this.pinnedApi.load())
        .then((ids) => {
          if (
            !this.isCurrentMember(memberId, memberRevision, sessionRevision) ||
            this.pinsRevision !== pinsRevision
          ) {
            return;
          }
          const pins = ids.map<ProjectPin>((value) => ({ kind: 'id', value }));
          this.pinsState.set(pins);
          ++this.pinsRevision;
          this.pinnedStorage.write(memberId, pins);
        })
        .catch(() => undefined);
    }
    return this.remotePinsLoad;
  }

  private queueRemotePinSave(
    pins: readonly ProjectPin[],
    memberId: number,
    memberRevision: number,
    sessionRevision: number,
  ): void {
    const ids = remotePinIds(pins, this.projectsState());
    if (this.remoteSaveQueueRevision !== memberRevision) {
      this.remoteSaveQueueRevision = memberRevision;
      this.remoteSaveQueue = Promise.resolve();
    }
    this.remoteSaveQueue = this.remoteSaveQueue
      .catch(() => undefined)
      .then(() => {
        if (!this.isCurrentMember(memberId, memberRevision, sessionRevision)) {
          return;
        }
        return firstValueFrom(this.pinnedApi.save(ids));
      })
      .catch(() => undefined);
  }

  private isCurrentMember(
    memberId: number,
    memberRevision: number,
    sessionRevision: number,
  ): boolean {
    return (
      this.memberId === memberId &&
      this.memberRevision === memberRevision &&
      this.memberSessionRevision === sessionRevision &&
      this.authTokens.revision() === sessionRevision
    );
  }

  private beginRequest(): void {
    this.pendingRequests += 1;
    this.loadingState.set(true);
  }

  private endRequest(): void {
    this.pendingRequests = Math.max(0, this.pendingRequests - 1);
    this.loadingState.set(this.pendingRequests > 0);
  }
}

function remotePinIds(
  pins: readonly ProjectPin[],
  projects: readonly TaigaProjectListItem[],
): readonly number[] {
  const projectsBySlug = new Map(projects.map((project) => [project.slug, project.id]));
  const ids = pins
    .map((pin) => (pin.kind === 'id' ? pin.value : projectsBySlug.get(pin.value)))
    .filter((id): id is number => id !== undefined);
  return [...new Set(ids)];
}

function locatorPins(locator: ProjectLocator): readonly ProjectPin[] {
  if (typeof locator === 'number') {
    return Number.isSafeInteger(locator) && locator >= 0 ? [{ kind: 'id', value: locator }] : [];
  }
  if (typeof locator === 'string') {
    const slug = locator.trim();
    return slug ? [{ kind: 'slug', value: slug }] : [];
  }

  const pins: ProjectPin[] = [];
  if (Number.isSafeInteger(locator.id) && (locator.id ?? -1) >= 0) {
    pins.push({ kind: 'id', value: locator.id! });
  }
  const slug = locator.slug?.trim();
  if (slug) {
    pins.push({ kind: 'slug', value: slug });
  }
  return pins;
}

function preferredPin(locator: ProjectLocator): ProjectPin | null {
  return locatorPins(locator)[0] ?? null;
}

function pinsEqual(left: ProjectPin, right: ProjectPin): boolean {
  return pinKey(left) === pinKey(right);
}
