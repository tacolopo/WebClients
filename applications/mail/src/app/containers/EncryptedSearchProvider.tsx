import { ReactNode, createContext, useContext, useEffect, useRef, useState } from 'react';
import { useHistory } from 'react-router-dom';

import { c } from 'ttag';

import {
    FeatureCode,
    useAddresses,
    useApi,
    useFeature,
    useGetMessageCounts,
    useGetUserKeys,
    useLocalState,
    useNotifications,
    useSubscribeEventManager,
    useUser,
    useWelcomeFlags,
} from '@proton/components';
import {
    checkVersionedESDB,
    esSentryReport,
    getIndexKey,
    readContentProgress,
    useEncryptedSearch,
    wrappedGetOldestInfo,
} from '@proton/encrypted-search';
import { SECOND } from '@proton/shared/lib/constants';
import { EVENT_ERRORS } from '@proton/shared/lib/errors';
import { isMobile } from '@proton/shared/lib/helpers/browser';
import { isFree, isPaid } from '@proton/shared/lib/user/helpers';

import { defaultESContextMail, defaultESMailStatus } from '../constants';
import { convertEventType, getESHelpers, migrate, parseSearchParams } from '../helpers/encryptedSearch';
import { useGetMessageKeys } from '../hooks/message/useGetMessageKeys';
import {
    ESBaseMessage,
    ESDBStatusMail,
    ESMessageContent,
    EncryptedSearchFunctionsMail,
    NormalizedSearchParams,
} from '../models/encryptedSearch';
import { Event } from '../models/event';

const EncryptedSearchContext = createContext<EncryptedSearchFunctionsMail>(defaultESContextMail);
export const useEncryptedSearchContext = () => useContext(EncryptedSearchContext);

interface Props {
    children?: ReactNode;
}

const EncryptedSearchProvider = ({ children }: Props) => {
    const history = useHistory();
    const [user] = useUser();
    const [initialIndexing, setInitialIndexing] = useLocalState(false, `ES:${user.ID}:InitialIndexing`);
    const getMessageKeys = useGetMessageKeys();
    const getUserKeys = useGetUserKeys();
    const getMessageCounts = useGetMessageCounts();
    const api = useApi();
    const [welcomeFlags] = useWelcomeFlags();
    const { update: updateSpotlightES } = useFeature(FeatureCode.SpotlightEncryptedSearch);
    const { feature: esAutomaticBackgroundIndexingFeature } = useFeature(FeatureCode.ESAutomaticBackgroundIndexing);
    const { createNotification } = useNotifications();
    const { isSearch, page } = parseSearchParams(history.location);

    const [addresses] = useAddresses();

    const [esMailStatus, setESMailStatus] = useState<ESDBStatusMail>(defaultESMailStatus);
    // Allow to track changes in page to set the elements list accordingly
    const pageRef = useRef<number>(0);

    const esHelpers = getESHelpers({
        getMessageKeys,
        getMessageCounts,
        api,
        user,
        history,
        numAddresses: addresses.length,
    });

    const successMessage = c('Success').t`Message content search activated`;

    const esLibraryFunctions = useEncryptedSearch<ESBaseMessage, NormalizedSearchParams, ESMessageContent>({
        refreshMask: EVENT_ERRORS.MAIL,
        esHelpers,
        successMessage,
    });

    /**
     * Open the advanced search dropdown
     */
    const openDropdown = () => {
        setESMailStatus((esMailStatus) => ({
            ...esMailStatus,
            dropdownOpened: true,
        }));
    };

    /**
     * Close the advanced search dropdown
     */
    const closeDropdown = () => {
        setESMailStatus((esMailStatus) => ({
            ...esMailStatus,
            dropdownOpened: false,
        }));
    };

    /**
     * Temporarily disable ES for times when search is too slow and a server-side
     * search is needed. The toggle is set automatically back on upon exiting search mode
     */
    const setTemporaryToggleOff = () => {
        setESMailStatus((esMailStatus) => ({
            ...esMailStatus,
            temporaryToggleOff: true,
        }));
        void esLibraryFunctions.toggleEncryptedSearch();
    };

    /**
     * Report the status of IndexedDB with the addition of Mail-specific fields
     */
    const getESDBStatus = () => {
        return {
            ...esLibraryFunctions.getESDBStatus(),
            ...esMailStatus,
        };
    };

    /**
     * Initialize ES
     */
    const initializeESMail = async () => {
        if (isFree(user) && !!esAutomaticBackgroundIndexingFeature?.Value) {
            // Avoid indexing for incognito users
            // If initialIndexing is set, it means that the user is not incognito
            if (initialIndexing) {
                // Start indexing
                const success = await esLibraryFunctions.enableEncryptedSearch(); // TODO: pass parameter to indicate background mode

                if (success) {
                    await esLibraryFunctions.enableContentSearch();
                }
                return;
            } else {
                setInitialIndexing(true);
                return;
            }
        }

        setESMailStatus((esMailStatus) => ({
            ...esMailStatus,
            isMigrating: true,
        }));

        // Migrate old IDBs
        const { success, isIndexEmpty } = await migrate(user.ID, api, getUserKeys, getMessageKeys, () =>
            esHelpers.queryItemsMetadata(new AbortController().signal)
        ).catch((error) => {
            esSentryReport(`migration: ${error.message}`, error);
            return { success: false, isIndexEmpty: false };
        });

        setESMailStatus((esMailStatus) => ({
            ...esMailStatus,
            isMigrating: false,
        }));

        if (!success) {
            if (!isIndexEmpty) {
                createNotification({
                    text: c('Error')
                        .t`There was a problem updating your local messages, they will be downloaded again to re-enable content search`,
                    type: 'error',
                });
            }

            return esLibraryFunctions
                .esDelete()
                .then(() => esLibraryFunctions.enableEncryptedSearch({ isRefreshed: true }))
                .then((success) =>
                    success ? esLibraryFunctions.enableContentSearch({ isRefreshed: true }) : undefined
                );
        }

        // Enable encrypted search for all new users. For paid users only,
        // automatically enable content search too
        if (welcomeFlags.isWelcomeFlow && !isMobile()) {
            // Prevent showing the spotlight for ES to them
            await updateSpotlightES(false);
            return esLibraryFunctions.enableEncryptedSearch().then((success) => {
                if (success && isPaid(user)) {
                    return esLibraryFunctions.enableContentSearch({ notify: false });
                }
            });
        }

        // Existence of IDB is checked since the following operations interact with it
        if (!(await checkVersionedESDB(user.ID))) {
            return;
        }

        let contentProgress = await readContentProgress(user.ID);
        if (!contentProgress) {
            return esLibraryFunctions.initializeES();
        }

        // We need to cache the metadata directly, since the library is
        // not yet initialised, i.e. the flags in memory are not yet set.
        // The reason for not initialising the library just yet is that
        // in case an upgrade/downgrade is needed, the flags would be set
        // incorrectly due to the way we encode the latter
        const indexKey = await getIndexKey(getUserKeys, user.ID);
        if (!indexKey) {
            return esLibraryFunctions.esDelete();
        }

        return esLibraryFunctions.initializeES();
    };

    useSubscribeEventManager(async (event: Event) =>
        esLibraryFunctions.handleEvent(convertEventType(event, addresses.length))
    );

    /**
     * Keep the current page always up to date to avoid pagination glitches
     */
    useEffect(() => {
        pageRef.current = page;
    }, [page]);

    /**
     * In case content indexing finished, we need to update the last content
     * time to show appropriate UI
     */
    useEffect(() => {
        const run = async () => {
            const timepoint = await wrappedGetOldestInfo(user.ID);
            if (timepoint) {
                setESMailStatus((esMailStatus) => ({
                    ...esMailStatus,
                    lastContentTime: timepoint.timepoint[0] * SECOND,
                }));
            }
        };

        const { dbExists, contentIndexingDone } = getESDBStatus();
        if (dbExists && contentIndexingDone) {
            void run();
        }
    }, [getESDBStatus().contentIndexingDone]);

    /**
     * Re-enable ES in case it was disabled because of a slow search
     */
    useEffect(() => {
        if (!isSearch) {
            const { temporaryToggleOff } = esMailStatus;
            if (temporaryToggleOff) {
                void esLibraryFunctions.toggleEncryptedSearch();
                // Remove the temporary switch-off of ES
                setESMailStatus((esMailStatus) => ({
                    ...esMailStatus,
                    temporaryToggleOff: false,
                }));
            }
        }
    }, [isSearch]);

    useEffect(() => {
        void initializeESMail();
    }, []);

    const esFunctions = {
        ...esLibraryFunctions,
        getESDBStatus,
        openDropdown,
        closeDropdown,
        setTemporaryToggleOff,
    };

    return <EncryptedSearchContext.Provider value={esFunctions}>{children}</EncryptedSearchContext.Provider>;
};

export default EncryptedSearchProvider;
