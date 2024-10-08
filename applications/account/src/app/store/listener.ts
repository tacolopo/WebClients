import {
    authenticationListener,
    organizationKeysManagementListener,
    startListeningToPlanNameChange,
    startPersistListener,
} from '@proton/account';
import { startCalendarEventListener, startHolidaysDirectoryListener } from '@proton/calendar';
import { startSharedListening } from '@proton/redux-shared-store/sharedListeners';

import type { AccountState, AppStartListening } from './store';

export const start = ({
    startListening,
    persistTransformer,
    mode,
}: {
    startListening: AppStartListening;
    mode: 'public' | 'lite' | 'default';
    persistTransformer: (state: AccountState) => any;
}) => {
    if (mode === 'default') {
        startSharedListening(startListening);
        startCalendarEventListener(startListening);
        startHolidaysDirectoryListener(startListening);
        startPersistListener(startListening, persistTransformer);
        organizationKeysManagementListener(startListening);
        startListeningToPlanNameChange(startListening);
    }

    if (mode === 'lite') {
        authenticationListener(startListening);
    }
};
