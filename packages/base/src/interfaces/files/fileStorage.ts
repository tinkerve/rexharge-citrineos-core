// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { Buffer } from 'node:buffer';

export interface IFileStorage {
  /**
   *
   * @param fileName Name of the file
   * @param content File content
   * @param filePath The path of the file, if not in root. Used as the bucket name for S3.
   *
   * @returns The ID of the file
   */
  saveFile(fileName: string, content: Buffer, filePath?: string): Promise<string>;

  /**
   *
   * @param id The ID of the file
   * @param filePath The path of the file, if not included in the ID. Used as the bucket name for S3.
   *
   * @returns The file content
   */
  getFile(id: string, filePath?: string): Promise<string | undefined>;

  /**
   * Checks whether a file or directory exists at the given path.
   *
   * @param path The file or directory path. For object storage (S3, GCP), treated as an object key or prefix.
   */
  exists(path: string): Promise<boolean>;

  /**
   * Creates a directory at the given path.
   * For object storage backends (S3, GCP) this may be a no-op since directories are implicit.
   *
   * @param path The directory path to create
   * @param options Optional options, e.g. { recursive: true }
   */
  createDirectory(path: string, options?: { recursive?: boolean }): Promise<void>;

  /**
   * Removes a file or directory at the given path.
   * For object storage backends (S3, GCP), recursive removal deletes all objects sharing the path prefix.
   *
   * @param path The path to remove
   * @param options Optional options, e.g. { recursive: true, force: true }
   */
  deleteFile(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void>;
}
