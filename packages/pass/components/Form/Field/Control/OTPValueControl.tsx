import { type VFC17 } from 'react';

import { c } from 'ttag';

import { usePassCore } from '@proton/pass/components/Core/PassCoreProvider';
import { OTPDonut } from '@proton/pass/components/Otp/OTPDonut';
import { OTPValue } from '@proton/pass/components/Otp/OTPValue';
import { usePeriodicOtpCode } from '@proton/pass/hooks/usePeriodicOtpCode';
import { type OtpRequest } from '@proton/pass/types';

import { ValueControl } from './ValueControl';

type Props = { label?: string; payload: OtpRequest };

/* This component handles the period otp code generation
 * to avoid cluttering the render cycle of a component in
 * need of the OTP code generation as it involves alot of
 * re-rendering. eg: we do not want to re-render `Login.view`
 * everytime the OTP countdown updates */
export const OTPValueControl: VFC17<Props> = ({ label, payload }) => {
    const { generateOTP } = usePassCore();
    const [otp, percent] = usePeriodicOtpCode({ generate: generateOTP, payload });

    return (
        <ValueControl
            clickToCopy
            icon="lock"
            value={otp?.token ?? ''}
            label={label ?? c('Label').t`2FA token (TOTP)`}
            actions={<OTPDonut enabled={otp !== null} percent={percent} period={otp?.period} />}
        >
            <OTPValue code={otp?.token ?? ''} />
        </ValueControl>
    );
};
