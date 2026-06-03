import { api } from './client';

// ── Auth ──────────────────────────────────────────────────────────────────────
export const login = (userCode: string, password: string) =>
  api.post('/auth/login', { userCode, password }).then(r => r.data);
export const getMe          = () => api.get('/auth/me').then(r => r.data);
export const updateMe       = (data: { fullName?: string; email?: string }) =>
  api.patch('/auth/me', data).then(r => r.data);
export const changePassword = (currentPassword: string, newPassword: string) =>
  api.post('/auth/change-password', { currentPassword, newPassword }).then(r => r.data);

// ── Users ─────────────────────────────────────────────────────────────────────
export const getUsers     = (role?: string) => api.get('/users', { params: { role } }).then(r => r.data);
export const createUser   = (data: object)  => api.post('/users', data).then(r => r.data);
export const updateUser   = (id: string, data: object) => api.patch(`/users/${id}`, data).then(r => r.data);

// ── Programs ──────────────────────────────────────────────────────────────────
export const getPrograms   = ()                        => api.get('/programs').then(r => r.data);
export const createProgram = (data: object)            => api.post('/programs', data).then(r => r.data);
export const updateProgram = (id: string, data: object) => api.patch(`/programs/${id}`, data).then(r => r.data);

// ── Courses ───────────────────────────────────────────────────────────────────
export const getCourses   = (programId?: string) => api.get('/courses', { params: { programId } }).then(r => r.data);
export const createCourse = (data: object)       => api.post('/courses', data).then(r => r.data);
export const updateCourse = (id: string, data: object) => api.patch(`/courses/${id}`, data).then(r => r.data);

// ── Curriculum (per-program course placement) ─────────────────────────────────
export const getCurriculum         = (programId: string) =>
  api.get(`/programs/${programId}/curriculum`).then(r => r.data);
export const addCurriculumEntry    = (programId: string, data: object) =>
  api.post(`/programs/${programId}/curriculum`, data).then(r => r.data);
export const removeCurriculumEntry = (programId: string, entryId: string) =>
  api.delete(`/programs/${programId}/curriculum/${entryId}`);

// ── Terms ─────────────────────────────────────────────────────────────────────
export const getTerms   = ()                        => api.get('/terms').then(r => r.data);
export const createTerm = (data: object)            => api.post('/terms', data).then(r => r.data);
export const updateTerm = (id: string, data: object) => api.patch(`/terms/${id}`, data).then(r => r.data);
export const openTerm   = (id: string, data: object) => api.post(`/terms/${id}/open`, data).then(r => r.data);

// ── Sections ──────────────────────────────────────────────────────────────────
export const getSections   = (params?: object)         => api.get('/sections', { params }).then(r => r.data);
export const createSection = (data: object)            => api.post('/sections', data).then(r => r.data);
export const updateSection = (id: string, data: object) => api.patch(`/sections/${id}`, data).then(r => r.data);

// ── Audit logs (admin) ────────────────────────────────────────────────────────
export const getAuditLogs       = (params?: object) =>
  api.get('/audit-logs', { params }).then(r => r.data);
export const getAuditLogActions = () =>
  api.get('/audit-logs/actions').then(r => r.data);

// ── Faculty availability ──────────────────────────────────────────────────────
export const getAvailability     = (facultyId: string) =>
  api.get(`/availability/${facultyId}`).then(r => r.data);
export const saveAvailability    = (facultyId: string, slots: object[]) =>
  api.put(`/availability/${facultyId}`, { slots }).then(r => r.data);

// ── Blocks (year/program cohorts) ─────────────────────────────────────────────
export const getBlocks      = ()                                  => api.get('/blocks').then(r => r.data);
export const promoteYear    = (programId: string, yearLevel: number) =>
  api.post('/blocks/promote', { programId, yearLevel }).then(r => r.data);
export const graduateBlock  = (blockId: string) =>
  api.post(`/blocks/${blockId}/graduate`).then(r => r.data);

// ── Enrollments ───────────────────────────────────────────────────────────────
export const getEnrollments      = (params?: object)         => api.get('/enrollments', { params }).then(r => r.data);
export const createEnrollment    = (data: object)            => api.post('/enrollments', data).then(r => r.data);
export const updateEnrollment    = (id: string, data: object) => api.patch(`/enrollments/${id}`, data).then(r => r.data);

// ── Gradebook ─────────────────────────────────────────────────────────────────
export const getGradebook      = (sectionId: string)          => api.get(`/sections/${sectionId}/gradebook`).then(r => r.data);
export const createCategory    = (sectionId: string, data: object) => api.post(`/sections/${sectionId}/categories`, data).then(r => r.data);
export const updateCategory    = (sectionId: string, catId: string, data: object) => api.patch(`/sections/${sectionId}/categories/${catId}`, data).then(r => r.data);
export const deleteCategory    = (sectionId: string, catId: string) => api.delete(`/sections/${sectionId}/categories/${catId}`);
export const createAssessment  = (sectionId: string, data: object) => api.post(`/sections/${sectionId}/assessments`, data).then(r => r.data);
export const updateAssessment  = (sectionId: string, asmId: string, data: object) => api.patch(`/sections/${sectionId}/assessments/${asmId}`, data).then(r => r.data);
export const deleteAssessment  = (sectionId: string, asmId: string) => api.delete(`/sections/${sectionId}/assessments/${asmId}`);
export const bulkSaveScores    = (sectionId: string, scores: object[]) => api.put(`/sections/${sectionId}/scores/bulk`, { scores }).then(r => r.data);
export const finalizeGrades    = (sectionId: string, data?: object) => api.post(`/sections/${sectionId}/finalize`, data ?? {}).then(r => r.data);
export const exportGradebook   = (sectionId: string)          => api.get(`/sections/${sectionId}/export`, { responseType: 'blob' }).then(r => r.data);
export const getStudentGrades  = (studentId: string)          => api.get(`/students/${studentId}/grades`).then(r => r.data);
export const getRoster         = (sectionId: string)          => api.get(`/sections/${sectionId}/roster`).then(r => r.data);
export const downloadRosterCsv = async (sectionId: string) => {
  const res = await api.get(`/sections/${sectionId}/roster/csv`, { responseType: 'blob' });
  const cd  = (res.headers['content-disposition'] as string | undefined) ?? '';
  const m   = cd.match(/filename="?([^";]+)"?/);
  const filename = m ? m[1] : 'roster.csv';
  const url = URL.createObjectURL(res.data as Blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  URL.revokeObjectURL(url);
};

// ── Notifications ─────────────────────────────────────────────────────────────
export const getNotifications      = (params?: { limit?: number; unreadOnly?: boolean }) =>
  api.get('/notifications', { params }).then(r => r.data);
export const getUnreadCount        = () =>
  api.get('/notifications/unread-count').then(r => r.data);
export const markNotificationRead  = (id: string) =>
  api.post(`/notifications/${id}/read`).then(r => r.data);
export const markAllNotificationsRead = () =>
  api.post('/notifications/read-all').then(r => r.data);

// ── Student curriculum + transcript ───────────────────────────────────────────
export const getCurriculumProgress = () =>
  api.get('/students/me/curriculum-progress').then(r => r.data);

export const downloadTranscript = async () => {
  const res = await api.get('/students/me/transcript', { responseType: 'blob' });
  const cd  = (res.headers['content-disposition'] as string | undefined) ?? '';
  const m   = cd.match(/filename="?([^";]+)"?/);
  const filename = m ? m[1] : 'transcript.csv';
  const url = URL.createObjectURL(res.data as Blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  URL.revokeObjectURL(url);
};

// ── Section auto-assign (admin) ──────────────────────────────────────────────
export type AutoAssignStrategy = 'balanced' | 'prefer-grouped-days' | 'prefer-mornings';
export interface AssignmentProposal {
  sectionId: string; sectionCode: string;
  courseCode: string; courseTitle: string; units: number;
  blockLabel: string;
  facultyId: string | null; facultyName: string | null;
  dayOfWeek: string | null; startTime: string | null; endTime: string | null;
  room: string | null;
  score: number; reason: string;
}
export const autoAssignPreview = (params: { termId: string; strategy: AutoAssignStrategy; onlyTba: boolean }) =>
  api.get('/sections/auto-assign/preview', { params }).then(r => r.data) as Promise<{
    proposals: AssignmentProposal[];
    summary: { total: number; filled: number; unfilled: number; facultyUsed: number; avgScore: number };
  }>;
export const autoAssignApply = (proposals: AssignmentProposal[]) =>
  api.post('/sections/auto-assign/apply', { proposals }).then(r => r.data) as Promise<{ applied: number; skipped: number }>;

// ── Faculty qualifications (preferred subjects) ──────────────────────────────
export interface QualificationItem {
  id: string; course_id: string; preference: number; notes: string | null;
  code: string; title: string; units: number; visibility: 'public' | 'restricted';
}
export const getQualifications = (facultyId: string) =>
  api.get(`/qualifications/${facultyId}`).then(r => r.data);
export const replaceQualifications = (facultyId: string, data: {
  maxTeachingUnits?: number | null;
  items: { courseId: string; preference: number; notes?: string }[];
}) => api.put(`/qualifications/${facultyId}`, data).then(r => r.data);
export const addQualification = (facultyId: string, data: { courseId: string; preference?: number; notes?: string }) =>
  api.post(`/qualifications/${facultyId}/items`, data).then(r => r.data);
export const updateQualification = (facultyId: string, id: string, data: { preference?: number; notes?: string | null }) =>
  api.patch(`/qualifications/${facultyId}/items/${id}`, data).then(r => r.data);
export const removeQualification = (facultyId: string, id: string) =>
  api.delete(`/qualifications/${facultyId}/items/${id}`);

// ── Wishlist (pre-registration) ──────────────────────────────────────────────
export const getWishlistTerms      = () =>
  api.get('/wishlist/terms').then(r => r.data);
export const getWishlistCandidates = (termId: string) =>
  api.get('/wishlist/candidates', { params: { termId } }).then(r => r.data);
export const getMyWishlist         = (termId?: string) =>
  api.get('/wishlist/me', { params: { termId } }).then(r => r.data);
export const addToWishlist         = (data: { termId: string; courseId: string; priority?: number; notes?: string }) =>
  api.post('/wishlist/me', data).then(r => r.data);
export const updateWishlistEntry   = (id: string, data: { priority?: number; notes?: string | null }) =>
  api.patch(`/wishlist/me/${id}`, data).then(r => r.data);
export const removeFromWishlist    = (id: string) =>
  api.delete(`/wishlist/me/${id}`);
export const getWishlistDemand     = (termId: string) =>
  api.get('/wishlist/demand', { params: { termId } }).then(r => r.data);

// ── Certificate of Registration ──────────────────────────────────────────────
export const getCor = () => api.get('/students/me/cor').then(r => r.data);

export const downloadCor = async () => {
  const res = await api.get('/students/me/cor.pdf', { responseType: 'blob' });
  const cd  = (res.headers['content-disposition'] as string | undefined) ?? '';
  const m   = cd.match(/filename="?([^";]+)"?/);
  const filename = m ? m[1] : 'COR.pdf';
  const url = URL.createObjectURL(res.data as Blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  URL.revokeObjectURL(url);
};
