import { useState } from 'react';

import { c } from 'ttag';

import { MAX_CHARS_API } from '@proton/account';
import { Button } from '@proton/atoms';
import useFlag from '@proton/components/containers/unleash/useFlag';
import { useLoading } from '@proton/hooks';
import { updateQuota, updateVPN } from '@proton/shared/lib/api/members';
import {
    createPasswordlessOrganizationKeys,
    updateOrganizationKeysLegacy,
    updateOrganizationKeysV2,
    updateOrganizationName,
} from '@proton/shared/lib/api/organization';
import { ENCRYPTION_CONFIGS, ENCRYPTION_TYPES, GIGA, VPN_CONNECTIONS } from '@proton/shared/lib/constants';
import {
    confirmPasswordValidator,
    getMinPasswordLengthMessage,
    passwordLengthValidator,
    requiredValidator,
} from '@proton/shared/lib/helpers/formValidators';
import humanSize from '@proton/shared/lib/helpers/humanSize';
import { getHasVpnOrPassB2BPlan } from '@proton/shared/lib/helpers/subscription';
import {
    generateOrganizationKeys,
    generatePasswordlessOrganizationKey,
    getHasMigratedAddressKeys,
} from '@proton/shared/lib/keys';
import clamp from '@proton/utils/clamp';
import noop from '@proton/utils/noop';

import {
    Alert,
    Form,
    InputFieldTwo,
    ModalTwo as Modal,
    ModalTwoContent as ModalContent,
    ModalTwoFooter as ModalFooter,
    ModalTwoHeader as ModalHeader,
    ModalProps,
    PasswordInputTwo,
    useFormErrors,
    useSettingsLink,
} from '../../components';
import {
    useAddresses,
    useApi,
    useAuthentication,
    useEventManager,
    useGetUserKeys,
    useMembers,
    useNotifications,
    useOrganization,
    useSubscription,
    useUser,
} from '../../hooks';
import MemberStorageSelector, { getStorageRange, getTotalStorage } from '../members/MemberStorageSelector';

enum STEPS {
    NAME,
    PASSWORD,
    STORAGE,
}

const SetupOrganizationModal = ({ onClose, ...rest }: ModalProps) => {
    const passwordlessEnabled = useFlag('OrganizationPasswordlessKey');
    const api = useApi();
    const authentication = useAuthentication();
    const { call } = useEventManager();
    const { createNotification } = useNotifications();
    const goToSettings = useSettingsLink();

    const [addresses] = useAddresses();
    const passwordlessMode = passwordlessEnabled && getHasMigratedAddressKeys(addresses);
    const getUserKeys = useGetUserKeys();
    const [members = [], loadingMembers] = useMembers();
    const [loading, withLoading] = useLoading();
    const [organization] = useOrganization();
    const [step, setStep] = useState<STEPS>(STEPS.NAME);
    const storageSizeUnit = GIGA;
    const [{ hasPaidVpn }] = useUser();
    const [subscription] = useSubscription();
    const hasVpnOrPassB2BPlan = getHasVpnOrPassB2BPlan(subscription);
    const selfMember = members.find(({ Self }) => !!Self);
    const storageRange = getStorageRange(selfMember, organization);
    const [model, setModel] = useState({
        name: '',
        password: '',
        confirm: '',
        storage: -1,
    });
    const { validator, onFormSubmit, reset } = useFormErrors();

    const handleChange = (key: keyof typeof model) => {
        return (value: any) => setModel({ ...model, [key]: value });
    };

    const selfMemberID = selfMember?.ID;
    const minStorage = organization?.RequiresKey ? 5 : 500;
    // Storage can be undefined in the beginning because org is undefined. So we keep it floating until it's set.
    const storageValue =
        model.storage === -1 ? clamp(minStorage * GIGA, storageRange.min, storageRange.max) : model.storage;

    const finalizeOrganizationCreation = async () => {
        await call();
        createNotification({ text: c('Success').t`Organization activated` });
        onClose?.();
        goToSettings('/users-addresses');
    };

    const setStepStorage = async () => {
        if (hasVpnOrPassB2BPlan) {
            // If user setting up organization for VPN B2B plan then the storage step must be skipped.
            await finalizeOrganizationCreation();
        } else {
            setStep(STEPS.STORAGE);
        }
    };

    const setupPasswordless = async () => {
        const userKey = (await getUserKeys())[0]?.privateKey;
        const { encryptedToken, signature, privateKeyArmored } = await generatePasswordlessOrganizationKey({
            userKey,
            encryptionConfig: ENCRYPTION_CONFIGS[ENCRYPTION_TYPES.CURVE25519],
        });
        await api(
            createPasswordlessOrganizationKeys({
                Token: encryptedToken,
                Signature: signature,
                PrivateKey: privateKeyArmored,
                Members: [],
                AdminInvitations: [],
                AdminActivations: [],
            })
        );
        return;
    };

    const { title, onSubmit, section } = (() => {
        if (step === STEPS.NAME) {
            const title = organization?.RequiresKey
                ? c('Title').t`Set organization name`
                : c('familyOffer_2023:Title').t`Set family name`;
            const label = organization?.RequiresKey
                ? c('Label').t`Organization name`
                : c('familyOffer_2023:Label').t`Family name`;

            return {
                title,
                section: (
                    <InputFieldTwo
                        id="organization-name"
                        label={label}
                        placeholder={c('Placeholder').t`Choose a name`}
                        error={validator([requiredValidator(model.name)])}
                        autoFocus
                        disableChange={loading}
                        value={model.name}
                        onValue={handleChange('name')}
                        maxLength={MAX_CHARS_API.ORG_NAME}
                    />
                ),
                async onSubmit() {
                    if (!selfMemberID) {
                        throw new Error('Missing member id');
                    }
                    // NOTE: By default the admin gets allocated all of the VPN connections. Here we artificially set the admin to the default value
                    // So that other users can get connections allocated.
                    await (hasPaidVpn && api(updateVPN(selfMemberID, VPN_CONNECTIONS)));
                    await api(updateOrganizationName(model.name));

                    if (organization?.RequiresKey && passwordlessMode) {
                        await setupPasswordless();
                        await setStepStorage();
                        return;
                    }

                    if (organization?.RequiresKey) {
                        setStep(STEPS.PASSWORD);
                    } else {
                        await setStepStorage();
                    }
                },
            };
        }

        if (step === STEPS.PASSWORD) {
            return {
                title: c('Title').t`Set organization password`,
                section: (
                    <>
                        <div className="mb-4">
                            {c('Info')
                                .t`Your organization password can be shared with other users you wish to give administrative privileges. It is also an emergency recovery code to gain access to your organization in case you lose access to your account. Please save this password and keep it safe.`}
                        </div>
                        <Alert className="mb-4" type="warning">
                            {c('Info')
                                .t`Do NOT forget this password. If you forget it, you will not be able to sign in or decrypt your messages.`}
                            <br />
                            {c('Info')
                                .t`Save your password somewhere safe. Click on icon to confirm that you have typed your password correctly.`}
                        </Alert>

                        <InputFieldTwo
                            autoFocus
                            id="orgPassword"
                            as={PasswordInputTwo}
                            label={c('Label').t`Organization password`}
                            placeholder={c('Placeholder').t`Password`}
                            value={model.password}
                            onValue={handleChange('password')}
                            assistiveText={getMinPasswordLengthMessage()}
                            error={validator([passwordLengthValidator(model.password)])}
                            autoComplete="new-password"
                        />

                        <InputFieldTwo
                            id="confirmPassword"
                            as={PasswordInputTwo}
                            label={c('Label').t`Confirm password`}
                            placeholder={c('Placeholder').t`Confirm`}
                            value={model.confirm}
                            onValue={handleChange('confirm')}
                            error={validator([
                                passwordLengthValidator(model.confirm),
                                confirmPasswordValidator(model.confirm, model.password),
                            ])}
                            autoComplete="new-password"
                        />
                    </>
                ),
                async onSubmit() {
                    const { privateKeyArmored, backupKeySalt, backupArmoredPrivateKey } =
                        await generateOrganizationKeys({
                            keyPassword: authentication.getPassword(),
                            backupPassword: model.password,
                            encryptionConfig: ENCRYPTION_CONFIGS[ENCRYPTION_TYPES.CURVE25519],
                        });

                    if (getHasMigratedAddressKeys(addresses)) {
                        await api(
                            updateOrganizationKeysV2({
                                PrivateKey: privateKeyArmored,
                                BackupPrivateKey: backupArmoredPrivateKey,
                                BackupKeySalt: backupKeySalt,
                                Members: [],
                            })
                        );
                    } else {
                        await api(
                            updateOrganizationKeysLegacy({
                                PrivateKey: privateKeyArmored,
                                BackupPrivateKey: backupArmoredPrivateKey,
                                BackupKeySalt: backupKeySalt,
                                Tokens: [],
                            })
                        );
                    }

                    await setStepStorage();
                },
            };
        }

        if (step === STEPS.STORAGE) {
            const formattedStorage = humanSize({ bytes: storageValue });
            return {
                title: c('Title').t`Allocate storage`,
                section: (
                    <>
                        <div className="mb-7">
                            {c('familyOffer_2023:Info')
                                .t`By default we assign ${formattedStorage} of storage to the administrator account. You can manage the assigned storage to be distributed among additional users later on.`}
                        </div>
                        <MemberStorageSelector
                            orgInitialization
                            value={storageValue}
                            sizeUnit={storageSizeUnit}
                            totalStorage={getTotalStorage(selfMember, organization)}
                            range={storageRange}
                            onChange={handleChange('storage')}
                        />
                    </>
                ),
                async onSubmit() {
                    if (!selfMemberID) {
                        throw new Error('Missing member id');
                    }
                    await api(updateQuota(selfMemberID, storageValue));

                    await finalizeOrganizationCreation();
                },
            };
        }

        throw new Error('Unknown step');
    })();

    const handleClose = loading ? noop : onClose;

    const handleBack = () => {
        if (organization?.RequiresKey && step) {
            setStep(step - 1);
            return;
        }

        // Going back when the organization don't requires a key should take user back to the name step
        if (!organization?.RequiresKey && step === STEPS.STORAGE) {
            setStep(STEPS.NAME);
            return;
        }

        setStep(step - 1);
    };

    return (
        <Modal
            as={Form}
            onSubmit={() => {
                if (!onFormSubmit()) {
                    return;
                }
                void withLoading(onSubmit()).then(reset);
            }}
            onClose={handleClose}
            size="medium"
            {...rest}
        >
            <ModalHeader title={title} />
            <ModalContent>{section}</ModalContent>
            <ModalFooter>
                {step ? (
                    <Button onClick={handleBack} disabled={loading}>
                        {c('Action').t`Back`}
                    </Button>
                ) : (
                    <Button onClick={handleClose} disabled={loading}>
                        {c('Action').t`Close`}
                    </Button>
                )}
                <Button disabled={loadingMembers} loading={loading} type="submit" color="norm">
                    {c('Action').t`Submit`}
                </Button>
            </ModalFooter>
        </Modal>
    );
};

export default SetupOrganizationModal;
