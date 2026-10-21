import { createError, defineEventHandler, readValidatedBody } from 'h3';

import Database from '#server/utils/Database';
import {
  assertAuthenticationAllowed,
  clearAuthenticationFailures,
  recordAuthenticationFailure,
} from '#server/utils/authThrottle';
import { SERVER_DEBUG, WG_ENV } from '#server/utils/config';
import { logSecurityEvent } from '#server/utils/securityLogger';
import { useWGSession } from '#server/utils/session';
import { assertUnreachable, validateZod } from '#server/utils/types';
import { UserLoginSchema } from '#db/repositories/user/types';

export default defineEventHandler(async (event) => {
  if (WG_ENV.DISABLE_PASSWORD_AUTH) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Password authentication is disabled',
    });
  }

  const { username, password, remember } = await readValidatedBody(
    event,
    validateZod(UserLoginSchema, event)
  );

  assertAuthenticationAllowed(event, 'password', username);

  const result = await Database.users.login(username, password);

  // TODO: add localization support

  if (!result.success) {
    switch (result.error) {
      case 'INCORRECT_CREDENTIALS':
        logSecurityEvent(event, 'password', username);
        recordAuthenticationFailure(event, 'password', username);
        throw createError({
          statusCode: 401,
          statusMessage: 'Invalid username or password',
        });
      case 'TOTP_REQUIRED': {
        clearAuthenticationFailures(event, 'password', username);
        const session = await useWGSession(event, remember);
        await session.update({
          pendingLogin: {
            type: 'password',
            userId: result.userId,
            remember,
            // 5min
            expires_at: Date.now() + 5 * 60 * 1000,
          },
        });
        return { status: 'TOTP_REQUIRED' as const };
      }
      case 'INVALID_TOTP_CODE':
        return { status: 'INVALID_TOTP_CODE' as const };
      case 'USER_DISABLED':
        throw createError({
          statusCode: 401,
          statusMessage: 'User disabled',
        });
      case 'UNEXPECTED_ERROR':
        throw createError({
          statusCode: 500,
          statusMessage: 'Unexpected error',
        });
    }
    assertUnreachable(result);
  }

  clearAuthenticationFailures(event, 'password', username);

  const user = result.user;

  const session = await useWGSession(event, remember);

  const data = await session.update({
    userId: user.id,
  });

  // TODO?: create audit log

  SERVER_DEBUG(`New Session: ${data.id} for ${user.id} (${user.username})`);

  return { status: 'success' as const };
});
