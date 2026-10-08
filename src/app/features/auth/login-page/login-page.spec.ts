import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { convertToParamMap, ActivatedRoute, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/auth';
import { LoginPage } from './login-page';

describe('LoginPage', () => {
  const login = vi.fn();
  const navigateByUrl = vi.fn();

  beforeEach(() => {
    login.mockReset();
    navigateByUrl.mockReset();
    navigateByUrl.mockResolvedValue(true);

    TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [
        { provide: AuthService, useValue: { login } },
        { provide: Router, useValue: { navigateByUrl } },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParamMap: convertToParamMap({ next: '/issues?tag=dev' }) },
          },
        },
      ],
    });
  });

  it('shows field errors and does not submit an empty form', () => {
    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();

    submitForm(fixture.nativeElement as HTMLElement);
    fixture.detectChanges();

    expect(login).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Enter your username or email.');
    expect(fixture.nativeElement.textContent).toContain('Enter your password.');
  });

  it('logs in and returns to the requested internal route', () => {
    login.mockReturnValue(of({ id: 1, username: 'vlady' }));
    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();

    setInput(fixture.nativeElement as HTMLElement, 'input[formControlName="username"]', 'vlady');
    setInput(fixture.nativeElement as HTMLElement, 'input[formControlName="password"]', 'secret');
    submitForm(fixture.nativeElement as HTMLElement);

    expect(login).toHaveBeenCalledWith({ username: 'vlady', password: 'secret' });
    expect(navigateByUrl).toHaveBeenCalledWith('/issues?tag=dev');
  });

  it('presents a useful error when Taiga rejects the credentials', () => {
    login.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 401, statusText: 'Unauthorized' })),
    );
    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();

    setInput(fixture.nativeElement as HTMLElement, 'input[formControlName="username"]', 'vlady');
    setInput(fixture.nativeElement as HTMLElement, 'input[formControlName="password"]', 'wrong');
    submitForm(fixture.nativeElement as HTMLElement);
    fixture.detectChanges();

    const alert = (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('username or password is incorrect');
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('lets keyboard and pointer users reveal the password', () => {
    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const password = element.querySelector<HTMLInputElement>('input[formControlName="password"]')!;
    const toggle = element.querySelector<HTMLButtonElement>('button[aria-label="Show password"]')!;

    toggle.click();
    fixture.detectChanges();

    expect(password.type).toBe('text');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.getAttribute('aria-label')).toBe('Hide password');
  });
});

function setInput(host: HTMLElement, selector: string, value: string): void {
  const input = host.querySelector<HTMLInputElement>(selector)!;
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

function submitForm(host: HTMLElement): void {
  host
    .querySelector('form')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}
