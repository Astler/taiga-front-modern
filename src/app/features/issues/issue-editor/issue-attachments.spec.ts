import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IssuesApiService } from '../data';
import { IssueAttachments } from './issue-attachments';

describe('IssueAttachments', () => {
  let api: {
    listAttachments: ReturnType<typeof vi.fn>;
    uploadAttachment: ReturnType<typeof vi.fn>;
    deleteAttachment: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    api = {
      listAttachments: vi.fn(() => of([])),
      uploadAttachment: vi.fn(() =>
        of({ id: 70, name: 'pasted.png', url: '/media/pasted.png', size: 10 })),
      deleteAttachment: vi.fn(() => of(undefined)),
    };
    await TestBed.configureTestingModule({
      imports: [IssueAttachments],
      providers: [{ provide: IssuesApiService, useValue: api }],
    }).compileComponents();
  });

  function create(issueId: number | null) {
    const fixture = TestBed.createComponent(IssueAttachments);
    fixture.componentRef.setInput('projectId', 17);
    fixture.componentRef.setInput('issueId', issueId);
    fixture.componentRef.setInput('canManage', true);
    fixture.detectChanges();
    return { fixture, host: fixture.nativeElement as HTMLElement };
  }

  it('stages files without API requests until the issue exists', () => {
    const { fixture, host } = create(null);
    const staged = vi.fn();
    fixture.componentInstance.stagedFilesChanged.subscribe(staged);

    const picker = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File(['screenshot'], 'report.png', { type: 'image/png' });
    Object.defineProperty(picker, 'files', { configurable: true, value: [file] });
    picker.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();

    expect(api.listAttachments).not.toHaveBeenCalled();
    expect(api.uploadAttachment).not.toHaveBeenCalled();
    expect(staged).toHaveBeenCalledWith([file]);
    expect(host.textContent).toContain('report.png');
    expect(host.textContent).toContain('Uploads when issue is created');

    host.querySelector<HTMLButtonElement>('[aria-label="Remove queued attachment report.png"]')!.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.stagedFiles()).toEqual([]);
    expect(staged).toHaveBeenLastCalledWith([]);
  });

  it('immediately uploads files added to existing issues', async () => {
    const { fixture } = create(38);
    const file = new File(['image'], 'pasted.png', { type: 'image/png' });

    fixture.componentInstance.addFiles([file]);
    await fixture.whenStable();

    expect(api.listAttachments).toHaveBeenCalledWith(17, 38);
    expect(api.uploadAttachment).toHaveBeenCalledWith(17, 38, file);
    expect(fixture.componentInstance.stagedFiles()).toEqual([]);
  });

  it('keeps failed existing-issue uploads available for retry', async () => {
    api.uploadAttachment
      .mockReturnValueOnce(throwError(() => new Error('Network failure')))
      .mockReturnValueOnce(of({ id: 70, name: 'pasted.png', url: '/media/pasted.png', size: 10 }));
    const { fixture, host } = create(38);
    fixture.componentInstance.addFiles([
      new File(['image'], 'pasted.png', { type: 'image/png' }),
    ]);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(host.textContent).toContain('Could not upload 1 file(s)');
    host.querySelector<HTMLButtonElement>('.issue-attachments-error button')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.uploadAttachment).toHaveBeenCalledTimes(2);
    expect(host.textContent).not.toContain('Could not upload 1 file(s)');
  });
});
