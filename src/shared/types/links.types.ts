import type { BaseEntity } from './common.types';

export interface QuickLink extends BaseEntity {
  title: string;
  url: string;
  icon: string;
  group?: string;
  order: number;
}

export interface LinksFile {
  schemaVersion: number;
  updatedAt: string;
  links: QuickLink[];
}

export interface CreateLinkInput {
  title: string;
  url: string;
  icon: string;
  group?: string;
}

export interface UpdateLinkInput {
  linkId: string;
  title?: string;
  url?: string;
  icon?: string;
  group?: string;
}
