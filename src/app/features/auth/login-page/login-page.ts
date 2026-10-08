import { HttpErrorResponse } from '@angular/common/http';
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
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService, normalizeAuthRedirect } from '../../../core/auth';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    ReactiveFormsModule,
  ],
  selector: 'pf-login-page',
  styleUrl: './login-page.scss',
  templateUrl: './login-page.html',
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly formElement = viewChild.required<ElementRef<HTMLFormElement>>('formElement');
  private readonly serverErrorElement = viewChild<ElementRef<HTMLElement>>('serverError');

  protected readonly credentials = this.formBuilder.nonNullable.group({
    username: ['', [Validators.required]],
    password: ['', [Validators.required]],
  });
  protected readonly username = this.credentials.controls.username;
  protected readonly password = this.credentials.controls.password;
  protected readonly passwordVisible = signal(false);
  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);

  protected togglePasswordVisibility(): void {
    this.passwordVisible.update((visible) => !visible);
  }

  protected submit(): void {
    if (this.submitting()) {
      return;
    }

    this.serverError.set(null);
    if (this.credentials.invalid) {
      this.credentials.markAllAsTouched();
      queueMicrotask(() => this.focusFirstInvalidControl());
      return;
    }

    this.submitting.set(true);
    this.credentials.disable({ emitEvent: false });

    this.auth
      .login(this.credentials.getRawValue())
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.submitting.set(false);
          this.credentials.enable({ emitEvent: false });
        }),
      )
      .subscribe({
        next: () => {
          void this.router.navigateByUrl(
            normalizeAuthRedirect(this.route.snapshot.queryParamMap.get('next')),
          );
        },
        error: (error: unknown) => {
          this.serverError.set(loginErrorMessage(error));
          queueMicrotask(() => this.serverErrorElement()?.nativeElement.focus());
        },
      });
  }

  private focusFirstInvalidControl(): void {
    this.formElement().nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }
}

function loginErrorMessage(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) {
    return 'Something went wrong. Please try again.';
  }
  if (error.status === 0) {
    return 'Taiga could not be reached. Check your connection and try again.';
  }
  if (error.status === 400 || error.status === 401) {
    return 'The username or password is incorrect.';
  }
  if (error.status === 429) {
    return 'Too many sign-in attempts. Wait a moment and try again.';
  }
  return 'Taiga could not sign you in. Please try again.';
}
