import { queryDomains, queryDomainAddresses } from '../api/domains';
import updateCollection from '../helpers/updateCollection';

export const updateDomainsModel = (api, Domains) => {
    return Promise.all(
        Domains.map(async (domain) => {
            if (!domain.addresses) {
                return domain;
            }
            const { Addresses = [] } = await api(queryDomainAddresses(domain.ID));
            return {
                ...domain,
                addresses: Addresses
            };
        })
    );
};

export const getDomainsModel = (api) => {
    return api(queryDomains()).then(({ Domains }) => updateDomainsModel(api, Domains));
};

export const DomainsModel = {
    key: 'Domains',
    get: getDomainsModel,
    update: updateCollection,
    sync: updateDomainsModel
};
