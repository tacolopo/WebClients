import { setNewRecoverySecret } from '@proton/shared/lib/api/settingsRecovery';
import {
    exportRecoveryFile,
    generateRecoverySecret,
    validateRecoverySecret,
} from '@proton/shared/lib/recoveryFile/recoveryFile';

import { useApi, useEventManager, useGetUserKeys, usePrimaryRecoverySecret } from '../../hooks';

const useDownloadRecoveryFile = () => {
    const api = useApi();
    const { call } = useEventManager();

    const getUserKeys = useGetUserKeys();

    const primaryRecoverySecret = usePrimaryRecoverySecret();

    const downloadRecoveryFile = async () => {
        const userKeys = await getUserKeys();
        const primaryUserKey = userKeys[0];
        if (!primaryUserKey) {
            return;
        }

        if (!primaryRecoverySecret) {
            const { recoverySecret, signature } = await generateRecoverySecret(primaryUserKey.privateKey);
            await api(
                setNewRecoverySecret({
                    RecoverySecret: recoverySecret,
                    Signature: signature,
                })
            );
            await exportRecoveryFile({ recoverySecret, userKeys });
            await call();
            return;
        }

        const valid = await validateRecoverySecret(primaryRecoverySecret, primaryUserKey.publicKey);
        if (!valid) {
            throw new Error('Unable to verify recovery file signature');
        }

        await exportRecoveryFile({
            recoverySecret: primaryRecoverySecret.RecoverySecret,
            userKeys,
        });
    };

    return downloadRecoveryFile;
};

export default useDownloadRecoveryFile;
