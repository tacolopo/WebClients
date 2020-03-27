import { transformEscape } from './transformEscape';
import { Base64Cache } from '../../hooks/useBase64Cache';
import { transformBase } from './transformBase';
import { transformLinks } from './transformLinks';
import { transformEmbedded } from './transformEmbedded';
import { MessageExtended } from '../../models/message';
import { AttachmentsCache } from '../../containers/AttachmentProvider';
import { Api } from 'proton-shared/lib/interfaces';
import { MailSettings } from '../../models/utils';
import { transformWelcome } from './transformWelcome';
import { transformStylesheet } from './transformStylesheet';
import { transformRemote } from './transformRemote';

export const prepareMailDocument = async (
    message: MessageExtended,
    base64Cache: Base64Cache,
    attachmentsCache: AttachmentsCache,
    api: Api,
    mailSettings: MailSettings
) => {
    const document = transformEscape(message.decryptedBody, base64Cache);

    transformBase(document);

    transformLinks(document);

    const { showEmbeddedImages, embeddeds } = await transformEmbedded(
        { ...message, document },
        attachmentsCache,
        api,
        mailSettings
    );

    transformWelcome(document);

    transformStylesheet(document);

    const { showRemoteImages } = transformRemote({ ...message, document }, mailSettings);

    return { document, showRemoteImages, showEmbeddedImages, embeddeds };
};
