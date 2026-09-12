import { ipcMain } from 'electron';
import { LINKS_CHANNELS } from '../../shared/ipcChannels';
import type { IpcResult } from '../../shared/types/common.types';
import type { CreateLinkInput, LinksFile, UpdateLinkInput } from '../../shared/types/links.types';
import * as linksService from '../modules/links/links.service';

function toResult<T>(promise: Promise<T>): Promise<IpcResult<T>> {
  return promise
    .then((data): IpcResult<T> => ({ ok: true, data }))
    .catch((error: unknown): IpcResult<T> => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
}

export function registerLinksIpc(): void {
  ipcMain.handle(LINKS_CHANNELS.getLinks, () => toResult<LinksFile>(linksService.getLinks()));

  ipcMain.handle(LINKS_CHANNELS.createLink, (_event, input: CreateLinkInput) =>
    toResult<LinksFile>(linksService.createLink(input)),
  );

  ipcMain.handle(LINKS_CHANNELS.updateLink, (_event, input: UpdateLinkInput) =>
    toResult<LinksFile>(linksService.updateLink(input)),
  );

  ipcMain.handle(LINKS_CHANNELS.deleteLink, (_event, linkId: string) =>
    toResult<LinksFile>(linksService.deleteLink(linkId)),
  );

  ipcMain.handle(LINKS_CHANNELS.reorderLinks, (_event, orderedLinkIds: string[]) =>
    toResult<LinksFile>(linksService.reorderLinks(orderedLinkIds)),
  );
}
