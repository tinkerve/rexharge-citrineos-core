// Copyright Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache 2.0

import { AbstractMapper } from '../AbstractMapper';
import { IsString, MaxLength } from 'class-validator';
import { IdToken } from '../../model/Authorization';
import {OCPP1_6} from "@citrineos/base";

export class IdTokenMapper extends AbstractMapper<IdToken> {
  toModel(idToken: string): IdToken {
    return IdToken.build({
      idToken: this.idToken,
    });
  }

  static fromModel(authorization: Authorization): IdToken {
    const idTagInfo = new OCPP1_6.IdTagInfo();
    idTagInfo.expiryDate = idTokenInfo.cacheExpiryDateTime;
    idTagInfo.parentIdTag = idTokenInfo.groupIdToken
        ? idTokenInfo.groupIdToken.idToken
        : undefined;
    return idTagInfo
  }
}
