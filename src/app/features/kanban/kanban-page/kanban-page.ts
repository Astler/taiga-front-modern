import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ActivatedRoute } from '@angular/router';
import { distinctUntilChanged, map } from 'rxjs';
import { AuthService } from '../../../core/auth';
import { ProjectStore } from '../../projects/data';
import { KanbanBoard } from '../kanban-board';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [KanbanBoard, MatButtonModule, MatProgressBarModule],
  selector: 'pf-kanban-page',
  styleUrl: './kanban-page.scss',
  templateUrl: './kanban-page.html',
})
export class KanbanPage {
  protected readonly projects = inject(ProjectStore);
  protected readonly requestedSlug = signal<string | null>(null);
  protected readonly requestedProjectFailed = signal(false);
  protected readonly activeProject = computed(() => {
    const project = this.projects.selectedProject();
    const slug = this.requestedSlug();
    return project && (!slug || project.slug === slug) ? project : null;
  });

  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private requestedProjectRevision = 0;

  constructor() {
    this.route.paramMap
      .pipe(
        map((params) => params.get('projectSlug')),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((slug) => {
        this.requestedSlug.set(slug);
        this.requestedProjectFailed.set(false);
        ++this.requestedProjectRevision;
        if (slug) {
          this.loadRequestedProject(slug);
        }
      });
  }

  protected retry(): void {
    const slug = this.requestedSlug();
    if (slug) {
      this.requestedProjectFailed.set(false);
      this.loadRequestedProject(slug);
      return;
    }

    const userId = this.auth.user()?.id;
    if (userId !== undefined) {
      void this.projects.loadMemberProjects(userId).catch(() => undefined);
    }
  }

  private loadRequestedProject(slug: string): void {
    const revision = ++this.requestedProjectRevision;
    void this.projects.selectBySlug(slug).catch(() => {
      if (revision === this.requestedProjectRevision) {
        this.requestedProjectFailed.set(true);
      }
    });
  }
}
