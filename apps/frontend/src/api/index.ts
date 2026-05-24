import { api } from './client';

// ── Auth ──────────────────────────────────────────────────────────────────────
export const login = (userCode: string, password: string) =>
  api.post('/auth/login', { userCode, password }).then(r => r.data);

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

// ── Sections ──────────────────────────────────────────────────────────────────
export const getSections   = (params?: object)         => api.get('/sections', { params }).then(r => r.data);
export const createSection = (data: object)            => api.post('/sections', data).then(r => r.data);
export const updateSection = (id: string, data: object) => api.patch(`/sections/${id}`, data).then(r => r.data);

// ── Blocks (year/program cohorts) ─────────────────────────────────────────────
export const getBlocks   = ()                                  => api.get('/blocks').then(r => r.data);
export const promoteYear = (programId: string, yearLevel: number) =>
  api.post('/blocks/promote', { programId, yearLevel }).then(r => r.data);

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
