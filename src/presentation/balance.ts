import type { Balance } from '@domain/jira/capacity';
import type { IconName } from './icons';
import type { StatusKind } from './status-kind';

/**
 * Where a person stands against the team average, drawn as a status chip: an icon and words back
 * the color, so it never depends on color alone. A load above the average is a warning, not an
 * error; below it is spare capacity, which is information.
 */
export const BALANCE_CHIP: Record<Balance, { kind: StatusKind; icon: IconName; label: string }> = {
  above: { kind: 'warning', icon: 'arrow-up', label: 'Por encima del promedio' },
  balanced: { kind: 'success', icon: 'check-circle', label: 'En equilibrio' },
  below: { kind: 'info', icon: 'arrow-down', label: 'Por debajo del promedio' },
};
