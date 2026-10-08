import { BreakpointObserver } from '@angular/cdk/layout';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterOutlet } from '@angular/router';
import { MatSidenavModule } from '@angular/material/sidenav';
import { Title } from '@angular/platform-browser';
import { ShellProjectContext } from '../project-context/shell-project-context';
import { Sidebar } from '../sidebar/sidebar';
import { Topbar } from '../topbar/topbar';

const COMPACT_VIEWPORT_QUERY = '(max-width: 839px)';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatSidenavModule, RouterOutlet, Sidebar, Topbar],
  providers: [ShellProjectContext],
  selector: 'pf-app-shell',
  styleUrl: './app-shell.scss',
  templateUrl: './app-shell.html',
})
export class AppShell {
  protected readonly compactViewport = signal(false);
  protected readonly navigationOpen = signal(true);

  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly destroyRef = inject(DestroyRef);
  private readonly routeContent = viewChild.required<ElementRef<HTMLElement>>('routeContent');
  private readonly router = inject(Router);
  private readonly title = inject(Title);

  constructor() {
    this.breakpointObserver
      .observe(COMPACT_VIEWPORT_QUERY)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ matches }) => {
        this.compactViewport.set(matches);
        this.navigationOpen.set(!matches);
      });
  }

  protected toggleNavigation(): void {
    this.navigationOpen.update((open) => !open);
  }

  protected closeCompactNavigation(): void {
    if (this.compactViewport()) {
      this.navigationOpen.set(false);
    }
  }

  protected routeActivated(): void {
    queueMicrotask(() => {
      let route = this.router.routerState.snapshot.root;
      while (route.firstChild) {
        route = route.firstChild;
      }
      const pageTitle = route.data['title'];
      this.title.setTitle(
        typeof pageTitle === 'string' ? `${pageTitle} · Taiga Modern` : 'Taiga Modern',
      );
      this.routeContent().nativeElement.focus();
    });
  }
}
