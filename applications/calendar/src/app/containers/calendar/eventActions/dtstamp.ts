import { getHasUpdatedInviteData } from '@proton/shared/lib/calendar/mailIntegration/invite';
import { withDtstamp } from '@proton/shared/lib/calendar/veventHelper';
import { omit } from '@proton/shared/lib/helpers/object';
import type { VcalVeventComponent } from '@proton/shared/lib/interfaces/calendar';

/**
 * DTSTAMP functions to some extent as a LAST-MODIFIED timestamp, but only for invite-related modifications
 */
export const withUpdatedDtstamp = (newVevent: VcalVeventComponent, oldVevent?: VcalVeventComponent) => {
    if (!getHasUpdatedInviteData({ newVevent, oldVevent })) {
        return { ...newVevent };
    }
    return withDtstamp(omit(newVevent, ['dtstamp']));
};
