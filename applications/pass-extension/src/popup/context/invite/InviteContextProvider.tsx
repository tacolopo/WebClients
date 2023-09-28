import type { FC } from 'react';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';

import type { MaybeNull } from '@proton/pass/types';
import type { Invite } from '@proton/pass/types/data/invites';
import noop from '@proton/utils/noop';

import { VaultInviteAccept } from '../../components/Invite/VaultInviteAccept';
import { VaultInviteCreate } from '../../components/Invite/VaultInviteCreate';
import { VaultInviteManager } from '../../components/Invite/VaultInviteManager';

export type InviteContextValue = {
    shareId: MaybeNull<string>;
    createInvite: (shareId: string) => void;
    acceptInvite: (invite: Invite) => void;
    rejectInvite: (invite: Invite) => void;
    manageAccess: (shareId: string) => void;
    close: () => void;
};

export type InviteView = 'invite' | 'manage';

const InviteContext = createContext<InviteContextValue>({
    shareId: null,
    createInvite: noop,
    acceptInvite: noop,
    rejectInvite: noop,
    manageAccess: noop,
    close: noop,
});

export const InviteContextProvider: FC = ({ children }) => {
    const [shareId, setShareId] = useState<MaybeNull<string>>(null);
    const [view, setView] = useState<MaybeNull<InviteView>>(null);
    const [invite, setInvite] = useState<MaybeNull<Invite>>(null);

    const createInvite = useCallback(async (shareId: string) => {
        setShareId(shareId);
        setView('invite');
    }, []);

    const acceptInvite = useCallback(async (invite: Invite) => setInvite(invite), []);

    const rejectInvite = useCallback(async () => {
        /* reject flow */
        setInvite(null);
    }, []);

    const manageAccess = useCallback((shareId: string) => {
        setShareId(shareId);
        setView('manage');
    }, []);

    const close = useCallback(() => {
        setShareId(null);
        setView(null);
    }, []);

    const contextValue = useMemo<InviteContextValue>(
        () => ({ shareId, createInvite, acceptInvite, rejectInvite, manageAccess, close }),
        [shareId]
    );

    return (
        <InviteContext.Provider value={contextValue}>
            {shareId &&
                (() => {
                    switch (view) {
                        case 'invite':
                            return <VaultInviteCreate shareId={shareId} />;
                        case 'manage':
                            return <VaultInviteManager shareId={shareId} />;
                    }
                })()}

            {invite && <VaultInviteAccept {...invite} />}
            {children}
        </InviteContext.Provider>
    );
};

export const useInviteContext = () => useContext(InviteContext);
