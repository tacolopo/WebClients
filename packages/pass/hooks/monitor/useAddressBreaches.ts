import { useEffect } from 'react';

import { useRequest } from '@proton/pass/hooks/useActionRequest';
import { type AddressBreachDTO, AddressType } from '@proton/pass/lib/monitor/types';
import { getAliasBreach, getCustomBreach, getProtonBreach } from '@proton/pass/store/actions';
import { aliasBreachRequest, customBreachRequest, protonBreachRequest } from '@proton/pass/store/actions/requests';

const getRequest = (dto: AddressBreachDTO) => {
    switch (dto.type) {
        case AddressType.PROTON:
            return [getProtonBreach, protonBreachRequest(dto.addressId)] as const;
        case AddressType.ALIAS:
            return [getAliasBreach, aliasBreachRequest(dto.shareId, dto.itemId)] as const;
        case AddressType.CUSTOM:
            return [getCustomBreach, customBreachRequest(dto.addressId)] as const;
    }
};

export const useAddressBreaches = <T extends AddressType>(dto: AddressBreachDTO<T>) => {
    const [request, initialRequestId] = getRequest(dto);
    const req = useRequest(request, { initialRequestId });

    useEffect(() => {
        switch (dto.type) {
            case AddressType.PROTON:
                return req.dispatch(dto.addressId);
            case AddressType.ALIAS:
                return req.dispatch({ shareId: dto.shareId, itemId: dto.itemId });
            case AddressType.CUSTOM:
                return req.dispatch(dto.addressId);
        }
    }, []);

    return req;
};
