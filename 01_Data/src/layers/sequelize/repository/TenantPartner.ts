// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { BootstrapConfig, CrudRepository } from '@citrineos/base';
import { Sequelize } from 'sequelize-typescript';
import { ILogObj, Logger } from 'tslog';
import { ITenantPartnerRepository } from '../../../interfaces';
import { Location } from '../model/Location/Location';
import { TenantPartnerLocation } from '../model/Location/TenantPartnerLocation';
import { TenantPartner } from '../model/TenantPartner';
import { SequelizeRepository } from './Base';

export class SequelizeTenantPartnerRepository
  extends SequelizeRepository<TenantPartner>
  implements ITenantPartnerRepository
{
  tenantPartnerLocation: CrudRepository<TenantPartnerLocation>;

  constructor(config: BootstrapConfig, logger?: Logger<ILogObj>, sequelizeInstance?: Sequelize) {
    super(config, TenantPartner.MODEL_NAME, logger, sequelizeInstance);
    this.tenantPartnerLocation = new SequelizeRepository<TenantPartnerLocation>(
      config,
      TenantPartnerLocation.MODEL_NAME,
      logger,
      sequelizeInstance,
    );
  }

  async assignLocationToTenantPartner(
    tenantId: number,
    tenantPartnerId: number,
    locationId: number,
  ): Promise<void> {
    await this.tenantPartnerLocation.readOrCreateByQuery(tenantId, {
      where: { tenantPartnerId, locationId, tenantId },
      defaults: { tenantId, tenantPartnerId, locationId },
    });
  }

  async removeLocationFromTenantPartner(
    tenantId: number,
    tenantPartnerId: number,
    locationId: number,
  ): Promise<void> {
    await this.tenantPartnerLocation.deleteAllByQuery(tenantId, {
      where: { tenantPartnerId, locationId, tenantId },
    });
  }

  async readLocationsByTenantPartnerId(
    tenantId: number,
    tenantPartnerId: number,
  ): Promise<Location[]> {
    const partner = await this.readOnlyOneByQuery(tenantId, {
      where: { id: tenantPartnerId, tenantId },
      include: [Location],
    });
    return (partner?.locations as Location[]) ?? [];
  }

  async readTenantPartnersByLocationId(
    tenantId: number,
    locationId: number,
  ): Promise<TenantPartner[]> {
    const records = await this.tenantPartnerLocation.readAllByQuery(tenantId, {
      where: { locationId, tenantId },
      include: [TenantPartner],
    });
    return records.map((r) => r.tenantPartner).filter(Boolean) as TenantPartner[];
  }
}
