import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { IssueDiscussion } from './issue-discussion';

describe('IssueDiscussion', () => {
  it('sends with Ctrl+Enter without submitting the issue form and clears only after confirmation', () => {
    const fixture = TestBed.createComponent(IssueDiscussion);
    fixture.componentRef.setInput('canComment', true);
    fixture.detectChanges();
    const send = vi.fn();
    fixture.componentInstance.send.subscribe(send);
    const parentSave = vi.fn();
    fixture.nativeElement.addEventListener('keydown', parentSave);
    const textarea = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
    textarea.value = '  My reply  ';
    textarea.dispatchEvent(new Event('input'));
    textarea.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }),
    );
    expect(send).toHaveBeenCalledWith('My reply');
    expect(parentSave).not.toHaveBeenCalled();
    expect(fixture.componentInstance.draft()).toBe('  My reply  ');
    fixture.componentRef.setInput('sentRevision', 1);
    fixture.detectChanges();
    expect(fixture.componentInstance.draft()).toBe('');
  });

  it('renders untrusted comment text safely and respects read-only roles', () => {
    const fixture = TestBed.createComponent(IssueDiscussion);
    fixture.componentRef.setInput('comments', [
      {
        id: '1',
        user: { name: 'Ada' },
        comment: '<img src=x onerror=alert(1)>\nSecond line',
      },
    ]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('textarea')).toBeNull();
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('<img src=x');
    expect(fixture.nativeElement.textContent).toContain('Ada');
  });
});
