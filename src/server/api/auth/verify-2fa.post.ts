import { createError, defineEventHandler, readValidatedBody } from 'h3';

import Database from '#server/utils/Database';
import {
  assertAuthenticationAllowed,
  clearAuthenticationFailures,
  recordAuthenticationFailure,
} from '#server/utils/authThrottle';
import { logSecurityEvent } from '#server/utils/securityLogger';
import { useWGSession } from '#server/utils/session';
import { assertUnreachable, validateZod } from '#server/utils/types';
import { Verify2faSchema } from '#db/repositories/user/types';

export default defineEventHandler(async (event) => {
  const { totpCode } = await readValidatedBody(
    event,
    validateZod(Verify2faSchema, event)
  );
  const session = await useWGSession(event);

  const pendingLogin = session.data.pendingLogin;
  if (!pendingLogin) {
    throw createError({
      statusCode: 401,
      statusMessage: 'No pending authentication',
    });
  }
  if (Date.now() > pendingLogin.expires_at) {
    await session.update({
      pendingLogin: undefined,
    });

    return { status: 'PENDING_LOGIN_EXPIRED' as const };
  }

  const throttleIdentity = String(pendingLogin.userId);
  assertAuthenticationAllowed(event, '2fa', throttleIdentity);

  const totpStatus = await Database.users.validateTotpCode(
    pendingLogin.userId,
    totpCode
  );

  switch (totpStatus) {
    case 'INVALID_TOTP_CODE':
      logSecurityEvent(event, '2fa');
      recordAuthenticationFailure(event, '2fa', throttleIdentity);
      return { status: 'INVALID_TOTP_CODE' as const };
    case 'USER_DISABLED':
      throw createError({
        statusCode: 401,
        statusMessage: 'User disabled',
      });
    case 'success':
      break;
    default:
      assertUnreachable(totpStatus);
  }

  clearAuthenticationFailures(event, '2fa', throttleIdentity);

  await session.update({
    userId: pendingLogin.userId,
    pendingLogin: undefined,
    oauth_nonce: undefined,
    oauth_state: undefined,
    oauth_verifier: undefined,
  });

  return { status: 'success' as const };
});
