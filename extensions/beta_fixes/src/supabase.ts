const BASE = 'https://nezbfbnhiyeqoprzhxcz.supabase.co/rest/v1';

export interface AdminProfile {
  id: number;
  id_profile: number;
  nickname: string;
  role: number;
  active: boolean;
}

export interface LinkRow {
  id: number;
  id_project: number;
  id_profile: number;
}

export interface ProjectRow {
  id: number;
  id_project: number;
  title: string;
  id_channel: string;
  token: string;
}

export type SessionResult =
  | { ok: true; admin: AdminProfile; links: LinkRow[]; projects: ProjectRow[] }
  | { ok: false; reason: 'rejected' | 'unavailable' };

type RequestResult =
  | { ok: true; body: unknown }
  | { ok: false; status: number };

export async function loadSession(key: string): Promise<SessionResult> {
  if (!key || /[\r\n]/.test(key)) {
    return { ok: false, reason: 'rejected' };
  }
  const adminResult = await request(
    key,
    `/beta_feedback_admin?select=id,id_profile,nickname,role,active,key&key=eq.${encodeURIComponent(key)}&active=eq.true`,
  );
  if (!adminResult.ok) {
    return { ok: false, reason: failureReason(adminResult.status) };
  }
  const admin = asArray(adminResult.body)
    .map(asAdmin)
    .find((row): row is AdminProfile => row !== undefined);
  if (!admin) {
    return { ok: false, reason: 'rejected' };
  }

  const linksResult = await request(
    key,
    `/beta_feedback_links?select=id,id_project,id_profile&id_profile=eq.${admin.id_profile}`,
  );
  if (!linksResult.ok) {
    return { ok: false, reason: failureReason(linksResult.status) };
  }
  const links = asArray(linksResult.body)
    .map(asLink)
    .filter((row): row is LinkRow => row !== undefined);

  const projectIds = [...new Set(links.map((link) => link.id_project))];
  if (projectIds.length === 0) {
    return { ok: true, admin, links, projects: [] };
  }

  const projectsResult = await request(
    key,
    `/beta_feedback_project?select=id,id_project,title,id_channel,token&id_project=in.(${projectIds.join(',')})`,
  );
  if (!projectsResult.ok) {
    return { ok: false, reason: failureReason(projectsResult.status) };
  }
  const projects = asArray(projectsResult.body)
    .map(asProject)
    .filter((row): row is ProjectRow => row !== undefined);
  return { ok: true, admin, links, projects };
}

function failureReason(status: number): 'rejected' | 'unavailable' {
  return status === 401 || status === 403 ? 'rejected' : 'unavailable';
}

async function request(key: string, pathAndQuery: string): Promise<RequestResult> {
  try {
    const response = await fetch(`${BASE}${pathAndQuery}`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(20_000),
    });
    const text = await response.text();
    if (!response.ok) {
      return { ok: false, status: response.status };
    }
    if (!text) {
      return { ok: true, body: [] };
    }
    try {
      return { ok: true, body: JSON.parse(preserveBigInts(text)) as unknown };
    } catch {
      return { ok: false, status: response.status };
    }
  } catch {
    return { ok: false, status: 0 };
  }
}

/** Snowflakes wider than 15 digits stay strings so JSON.parse does not round them. */
function preserveBigInts(text: string): string {
  return text.replace(/([:\[,]\s*)(-?\d{15,})(?=\s*[,}\]])/g, '$1"$2"');
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function asInt(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    return value;
  }
  if (typeof value === 'string' && /^-?\d+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function asAdmin(value: unknown): AdminProfile | undefined {
  const row = asRecord(value);
  if (!row) {
    return undefined;
  }
  const id = asInt(row.id);
  const idProfile = asInt(row.id_profile);
  if (id === undefined || idProfile === undefined) {
    return undefined;
  }
  return {
    id,
    id_profile: idProfile,
    nickname: typeof row.nickname === 'string' ? row.nickname : '',
    role: asInt(row.role) ?? 0,
    active: row.active === true,
  };
}

function asLink(value: unknown): LinkRow | undefined {
  const row = asRecord(value);
  if (!row) {
    return undefined;
  }
  const id = asInt(row.id);
  const idProject = asInt(row.id_project);
  const idProfile = asInt(row.id_profile);
  if (id === undefined || idProject === undefined || idProfile === undefined) {
    return undefined;
  }
  return { id, id_project: idProject, id_profile: idProfile };
}

function asProject(value: unknown): ProjectRow | undefined {
  const row = asRecord(value);
  if (!row) {
    return undefined;
  }
  const id = asInt(row.id);
  const idProject = asInt(row.id_project);
  const idChannel = asChannel(row.id_channel);
  const token = typeof row.token === 'string' ? row.token : '';
  if (id === undefined || idProject === undefined || !idChannel || !token) {
    return undefined;
  }
  return {
    id,
    id_project: idProject,
    title: typeof row.title === 'string' ? row.title : '',
    id_channel: idChannel,
    token,
  };
}

function asChannel(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  return '';
}
