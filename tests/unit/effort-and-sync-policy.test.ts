import { describe, expect, it } from 'vitest';
import { ACTIVE_STATUSES, activeTimeMs } from '@domain/jira/effort';
import {
  DELETE_GUARD_FLOOR,
  MAX_DELETE_SHARE,
  SYNC_RUN_STALE_AFTER_MS,
  isRunInProgress,
  isSafeDeletion,
  INCREMENTAL_OVERLAP_MS,
  LAZY_SYNC_MIN_INTERVAL_MS,
  LAZY_SYNC_STALE_AFTER_MS,
  incrementalSince,
  isStale,
  shouldTriggerLazySync,
} from '@domain/jira/sync-policy';
import { isDone } from '@domain/jira/ticket';

const base = new Date('2026-11-01T09:00:00Z');
const at = (hours: number): Date => new Date(base.getTime() + hours * 3_600_000);
const HOUR = 3_600_000;

describe('activeTimeMs (D-040: only In progress counts)', () => {
  it('counts only the time spent In progress, not the waiting statuses', () => {
    const total = activeTimeMs({
      createdAt: base,
      currentStatus: 'Done',
      now: at(100),
      transitions: [
        { from: 'To Do', to: 'In progress', at: at(2) },
        { from: 'In progress', to: 'Pending', at: at(6) },
        { from: 'Pending', to: 'Done', at: at(30) },
      ],
    });
    expect(total).toBe(4 * HOUR);
  });

  it('sums every visit when a ticket is reopened', () => {
    const total = activeTimeMs({
      createdAt: base,
      currentStatus: 'Done',
      now: at(100),
      transitions: [
        { from: 'To Do', to: 'In progress', at: at(1) },
        { from: 'In progress', to: 'Done', at: at(3) },
        { from: 'Done', to: 'In progress', at: at(10) },
        { from: 'In progress', to: 'Done', at: at(15) },
      ],
    });
    expect(total).toBe(7 * HOUR);
  });

  it('keeps counting up to now while the ticket is still In progress', () => {
    const total = activeTimeMs({
      createdAt: base,
      currentStatus: 'In progress',
      now: at(10),
      transitions: [{ from: 'To Do', to: 'In progress', at: at(4) }],
    });
    expect(total).toBe(6 * HOUR);
  });

  it('handles a ticket created already In progress', () => {
    const total = activeTimeMs({
      createdAt: base,
      currentStatus: 'Done',
      now: at(50),
      transitions: [{ from: 'In progress', to: 'Done', at: at(5) }],
    });
    expect(total).toBe(5 * HOUR);
  });

  it('uses the current status when there is no history', () => {
    const input = { createdAt: base, transitions: [], now: at(8) };
    expect(activeTimeMs({ ...input, currentStatus: 'In progress' })).toBe(8 * HOUR);
    expect(activeTimeMs({ ...input, currentStatus: 'To Do' })).toBe(0);
  });

  it('orders transitions by time and ignores case and spacing in names', () => {
    const total = activeTimeMs({
      createdAt: base,
      currentStatus: 'Done',
      now: at(50),
      transitions: [
        { from: ' in PROGRESS ', to: 'Done', at: at(5) },
        { from: 'To Do', to: ' in PROGRESS ', at: at(2) },
      ],
    });
    expect(total).toBe(3 * HOUR);
  });

  it('accepts a different list of active statuses', () => {
    const total = activeTimeMs(
      {
        createdAt: base,
        currentStatus: 'Done',
        now: at(50),
        transitions: [
          { from: 'To Do', to: 'Pending', at: at(1) },
          { from: 'Pending', to: 'Done', at: at(4) },
        ],
      },
      ['Pending'],
    );
    expect(total).toBe(3 * HOUR);
    expect(ACTIVE_STATUSES).toEqual(['In progress']);
  });
});

describe('sync policy (D-035)', () => {
  const now = new Date('2026-11-11T15:00:00Z');
  const ago = (ms: number): Date => new Date(now.getTime() - ms);
  const idle = {
    lastSuccessAt: ago(LAZY_SYNC_STALE_AFTER_MS + 1),
    lastAttemptAt: null,
    running: false,
  };

  it('treats data as stale only after 15 minutes', () => {
    expect(isStale(ago(LAZY_SYNC_STALE_AFTER_MS), now)).toBe(false);
    expect(isStale(ago(LAZY_SYNC_STALE_AFTER_MS + 1), now)).toBe(true);
    expect(isStale(null, now)).toBe(true);
  });

  it('starts a lazy sync when data is stale and nothing is happening', () => {
    expect(shouldTriggerLazySync(idle, now)).toBe(true);
    expect(shouldTriggerLazySync({ ...idle, lastSuccessAt: null }, now)).toBe(true);
  });

  it('does not start one while fresh or while one is running', () => {
    expect(shouldTriggerLazySync({ ...idle, lastSuccessAt: ago(60_000) }, now)).toBe(false);
    expect(shouldTriggerLazySync({ ...idle, running: true }, now)).toBe(false);
  });

  it('limits attempts to one every 5 minutes, even after a failure', () => {
    expect(
      shouldTriggerLazySync({ ...idle, lastAttemptAt: ago(LAZY_SYNC_MIN_INTERVAL_MS - 1) }, now),
    ).toBe(false);
    expect(
      shouldTriggerLazySync({ ...idle, lastAttemptAt: ago(LAZY_SYNC_MIN_INTERVAL_MS) }, now),
    ).toBe(true);
  });

  it('reads back a safety margin before the last success, or asks for a full load', () => {
    const last = new Date('2026-11-11T14:00:00Z');
    expect(incrementalSince(last)?.getTime()).toBe(last.getTime() - INCREMENTAL_OVERLAP_MS);
    expect(incrementalSince(null)).toBeNull();
  });
});

describe('run liveness and deletion guard (D-047)', () => {
  const now = new Date('2026-11-11T15:00:00Z');
  const ago = (ms: number): Date => new Date(now.getTime() - ms);

  it('treats a running run as alive for 15 minutes, then as dead', () => {
    expect(
      isRunInProgress({ status: 'running', startedAt: ago(SYNC_RUN_STALE_AFTER_MS - 1) }, now),
    ).toBe(true);
    expect(
      isRunInProgress({ status: 'running', startedAt: ago(SYNC_RUN_STALE_AFTER_MS) }, now),
    ).toBe(false);
  });

  it('never counts a finished run as in progress', () => {
    expect(isRunInProgress({ status: 'succeeded', startedAt: ago(1_000) }, now)).toBe(false);
    expect(isRunInProgress({ status: 'failed', startedAt: ago(1_000) }, now)).toBe(false);
  });

  it('allows small clean-ups and a normal share of a big cache', () => {
    expect(isSafeDeletion(0, 0)).toBe(true);
    expect(isSafeDeletion(DELETE_GUARD_FLOOR, 12)).toBe(true);
    expect(isSafeDeletion(200, 1000)).toBe(true);
  });

  it('rejects removing more than 20 % of a cache beyond the small-clean-up floor', () => {
    expect(isSafeDeletion(201, 1000)).toBe(false);
    expect(isSafeDeletion(1046, 1046)).toBe(false);
    expect(isSafeDeletion(DELETE_GUARD_FLOOR + 1, 20)).toBe(false);
    expect(MAX_DELETE_SHARE).toBe(0.2);
  });
});

describe('ticket', () => {
  it('groups by Jira status category, not by status name', () => {
    expect(isDone({ statusCategory: 'done' })).toBe(true);
    expect(isDone({ statusCategory: 'indeterminate' })).toBe(false);
    expect(isDone({ statusCategory: 'new' })).toBe(false);
  });
});
