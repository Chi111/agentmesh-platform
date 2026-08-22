import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { public_client_config } from '../utils/config';

let projectAuth: Auth | null = null;

export function getProjectAuth() {
  if (projectAuth) return projectAuth;
  const app = getApps().length
    ? getApp()
    : initializeApp({
        apiKey: public_client_config.auth_api_key,
        authDomain: public_client_config.auth_domain,
        projectId: public_client_config.auth_project_id,
      });
  projectAuth = getAuth(app);
  projectAuth.tenantId = public_client_config.tenant_id;
  return projectAuth;
}

