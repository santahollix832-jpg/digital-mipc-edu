import React, { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, ChevronLeft, ChevronRight, PencilLine, Plus, Search, Trash2, UserRound, X } from 'lucide-react';
import { apiFetch, assetUrl } from '../api/config';
import { useToast } from './ToastProvider';

const PAGE_SIZE = 7;
const emptyForm = {
  id: null,
  name: '',
  reg_number: '',
  class_name: '',
  gender: 'Female',
  status: 'Active',
  photo_url: '',
  photo_file: null,
};

function Students() {
  const { notify } = useToast();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('All');
  const [page, setPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [deleteStudent, setDeleteStudent] = useState(null);

  useEffect(() => {
    loadStudents();
  }, []);

  async function loadStudents() {
    try {
      setLoading(true);
      const response = await apiFetch('/students');
      if (!response.ok) {
        throw new Error(`Student list request failed (${response.status}).`);
      }
      const records = await response.json();
      if (!Array.isArray(records)) {
        throw new Error('Student list response was not a valid list.');
      }
      setStudents(
        records.map((student) => ({
          id: student.id,
          name: student.name || 'Unnamed student',
          reg_number: student.reg_number || student.regNo || 'N/A',
          class_name: student.class_name || student.className || student.class || 'N/A',
          gender: student.gender || 'Unknown',
          status: student.status || 'Active',
          photo_url: student.photo_url || student.photoUrl || '',
        }))
      );
    } catch (error) {
      console.error('Failed to load students:', error);
      notify('Unable to load the student directory.', 'error');
    } finally {
      setLoading(false);
    }
  }

  const classOptions = useMemo(
    () => ['All', ...new Set(students.map((student) => student.class_name).filter(Boolean))],
    [students]
  );

  const filteredStudents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return students.filter((student) => {
      const matchesSearch = !query ||
        student.name.toLowerCase().includes(query) ||
        student.reg_number.toLowerCase().includes(query);
      const matchesClass = classFilter === 'All' || student.class_name === classFilter;
      return matchesSearch && matchesClass;
    });
  }, [students, search, classFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / PAGE_SIZE));
  const visibleStudents = filteredStudents.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search, classFilter]);

  function openCreateModal() {
    setForm(emptyForm);
    setIsModalOpen(true);
  }

  function openEditModal(student) {
    setForm({
      id: student.id,
      name: student.name,
      reg_number: student.reg_number,
      class_name: student.class_name,
      gender: student.gender,
      status: student.status,
      photo_url: student.photo_url || '',
      photo_file: null,
    });
    setIsModalOpen(true);
  }

  function handleFormChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function handlePhotoChange(event) {
    const file = event.target.files?.[0];
    if (!file) {
      setForm((current) => ({ ...current, photo_file: null, photo_url: '' }));
      return;
    }

    const preview = URL.createObjectURL(file);
    setForm((current) => ({ ...current, photo_file: file, photo_url: preview }));
  }

  async function handleSaveStudent(event) {
    event.preventDefault();
    if (!form.name || !form.reg_number || !form.class_name) {
      notify('Please fill in the required student details.', 'warning');
      return;
    }

    setSaving(true);
    try {
      const isUpdating = Boolean(form.id);
      const endpoint = isUpdating ? `/students/${form.id}` : '/students/register';
      const method = isUpdating ? 'PUT' : 'POST';

      const formData = new FormData();
      formData.append('name', form.name);
      formData.append('reg_number', form.reg_number);
      formData.append('class_name', form.class_name);
      formData.append('gender', form.gender);
      formData.append('status', form.status || 'Active');
      if (form.photo_url && !form.photo_file && form.photo_url.startsWith('http')) {
        formData.append('photo_url', form.photo_url);
      }
      if (form.photo_file) {
        formData.append('photo', form.photo_file);
      }

      const response = await apiFetch(endpoint, {
        method,
        body: formData,
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || 'Student save failed.');
      }

      const student = result.student || {
        id: form.id || Date.now(),
        name: form.name,
        reg_number: form.reg_number,
        class_name: form.class_name,
        gender: form.gender,
        status: form.status || 'Active',
        photo_url: form.photo_url || '',
      };

      if (isUpdating) {
        setStudents((current) =>
          current.map((entry) =>
            entry.id === form.id
              ? {
                  ...entry,
                  name: student.name || form.name,
                  reg_number: student.reg_number || form.reg_number,
                  class_name: student.class_name || form.class_name,
                  gender: student.gender || form.gender,
                  status: student.status || form.status || 'Active',
                  photo_url: student.photo_url || entry.photo_url || '',
                }
              : entry
          )
        );
        notify('Student profile updated successfully.', 'success');
      } else {
        setStudents((current) => [{
          id: student.id,
          name: student.name || form.name,
          reg_number: student.reg_number || form.reg_number,
          class_name: student.class_name || form.class_name,
          gender: student.gender || form.gender,
          status: student.status || form.status || 'Active',
          photo_url: student.photo_url || '',
        }, ...current]);
        notify('New student added to the directory.', 'success');
      }

      setIsModalOpen(false);
      setForm(emptyForm);
    } catch (error) {
      console.error(error);
      notify(error.message || 'Unable to save student details.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteStudent() {
    if (!deleteStudent) return;

    try {
      const response = await apiFetch(`/students/${deleteStudent.id}`, { method: 'DELETE' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || 'Student deletion failed.');
      }
      setStudents((current) => current.filter((student) => student.id !== deleteStudent.id));
      setDeleteStudent(null);
      notify('Student deleted successfully.', 'success');
    } catch (error) {
      console.error(error);
      notify(error.message || 'Unable to delete the student record.', 'error');
    }
  }

  return (
    <main className="p-6 md:p-10">
      <header className="mb-8 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-600">Student directory</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Enterprise students management</h1>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-500"
        >
          <Plus size={18} />
          Add New Student
        </button>
      </header>

      <section className="mb-6 rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_20px_45px_rgba(15,23,42,0.03)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full max-w-lg">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name or registration number"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-indigo-400 focus:bg-white"
            />
          </div>

          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <span>Class</span>
            <select
              value={classFilter}
              onChange={(event) => setClassFilter(event.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:bg-white"
            >
              {classOptions.map((option) => (
                <option key={option} value={option}>{option === 'All' ? 'All classes' : option}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_20px_45px_rgba(15,23,42,0.04)]">
        {loading ? (
          <div className="space-y-3 p-6">
            {[...Array(5)].map((_, index) => (
              <div key={index} className="h-14 animate-pulse rounded-2xl bg-slate-200" />
            ))}
          </div>
        ) : visibleStudents.length === 0 ? (
          <div className="px-6 py-12 text-center text-slate-600">No students match your filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm text-slate-700">
              <thead className="bg-slate-50 text-xs uppercase tracking-[0.14em] text-slate-500">
                <tr>
                  <th className="px-5 py-4 font-semibold">Name</th>
                  <th className="px-5 py-4 font-semibold">Reg Number</th>
                  <th className="px-5 py-4 font-semibold">Class</th>
                  <th className="px-5 py-4 font-semibold">Gender</th>
                  <th className="px-5 py-4 font-semibold">Status</th>
                  <th className="px-5 py-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {visibleStudents.map((student) => (
                  <tr key={student.id} className="transition hover:bg-slate-50">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-indigo-100 text-indigo-700">
                              {student.photo_url ? (
                                <img src={student.photo_url && student.photo_url.startsWith('http') ? student.photo_url : assetUrl(student.photo_url)} alt={student.name} className="h-full w-full object-cover" />
                              ) : (
                                <UserRound size={17} />
                              )}
                            </div>
                            <div>
                              <div className="font-semibold text-slate-900">{student.name}</div>
                            </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 font-medium text-slate-600">{student.reg_number}</td>
                    <td className="px-5 py-4">{student.class_name}</td>
                    <td className="px-5 py-4">{student.gender}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${student.status === 'Active' ? 'border border-emerald-200 bg-emerald-100 text-emerald-700' : 'border border-amber-200 bg-amber-100 text-amber-700'}`}>
                        {student.status || 'Active'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedStudent(student)}
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-indigo-200 hover:text-indigo-600"
                        >
                          View profile
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(student)}
                          className="rounded-lg border border-slate-200 bg-white p-2 text-slate-700 transition hover:border-indigo-200 hover:text-indigo-600"
                          aria-label={`Edit ${student.name}`}
                        >
                          <PencilLine size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteStudent(student)}
                          className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-rose-600 transition hover:bg-rose-100"
                          aria-label={`Delete ${student.name}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3 text-sm text-slate-600">
          <p>
            {filteredStudents.length === 0 ? '0 results' : `Showing ${(page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, filteredStudents.length)} of ${filteredStudents.length}`}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page === 1}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 font-medium text-slate-600 transition hover:border-indigo-200 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={16} />
              Prev
            </button>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={page === totalPages}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 font-medium text-slate-600 transition hover:border-indigo-200 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>

      {isModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-600">Student profile</p>
                <h2 className="mt-1 text-2xl font-bold text-slate-900">{form.id ? 'Edit student' : 'Add new student'}</h2>
              </div>
              <button type="button" onClick={() => setIsModalOpen(false)} className="rounded-full bg-slate-100 p-2 text-slate-600 transition hover:bg-slate-200">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveStudent} className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Student Name</span>
                <input name="name" value={form.name} onChange={handleFormChange} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-indigo-400 focus:bg-white" />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Registration Number</span>
                <input name="reg_number" value={form.reg_number} onChange={handleFormChange} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-indigo-400 focus:bg-white" />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Class</span>
                <input name="class_name" value={form.class_name} onChange={handleFormChange} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-indigo-400 focus:bg-white" />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Gender</span>
                <select name="gender" value={form.gender} onChange={handleFormChange} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-indigo-400 focus:bg-white">
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                  <option value="Other">Other</option>
                </select>
              </label>

              <div className="md:col-span-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-indigo-100 text-indigo-700">
                      {form.photo_url ? (
                        <img src={form.photo_url && form.photo_url.startsWith('http') ? form.photo_url : assetUrl(form.photo_url)} alt="Student avatar" className="h-full w-full object-cover" />
                      ) : (
                        <UserRound size={24} />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">Student photo</p>
                      <p className="text-xs text-slate-500">Upload PNG, JPG, or provide a direct URL</p>
                    </div>
                  </div>
                  <label className="inline-flex cursor-pointer items-center rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700">
                    <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
                    Upload image
                  </label>
                </div>
                <div className="mt-4">
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-700">Photo URL</span>
                    <input
                      type="url"
                      value={form.photo_url}
                      onChange={(event) => setForm((current) => ({ ...current, photo_url: event.target.value, photo_file: null }))}
                      placeholder="https://example.com/student-photo.jpg"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none transition focus:border-indigo-400"
                    />
                  </label>
                </div>
              </div>

              <label className="block md:col-span-2">
                <span className="mb-2 block text-sm font-medium text-slate-700">Status</span>
                <select name="status" value={form.status} onChange={handleFormChange} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-indigo-400 focus:bg-white">
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </label>

              <div className="md:col-span-2 flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setIsModalOpen(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 font-semibold text-slate-700 transition hover:border-slate-300">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="rounded-xl bg-indigo-600 px-4 py-2.5 font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60">
                  {saving ? 'Saving…' : form.id ? 'Update student' : 'Create student'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedStudent && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-indigo-100 text-indigo-700">
                  {selectedStudent.photo_url ? (
                    <img src={selectedStudent.photo_url.startsWith('http') ? selectedStudent.photo_url : assetUrl(selectedStudent.photo_url)} alt={selectedStudent.name} className="h-full w-full object-cover" />
                  ) : (
                    <BadgeCheck size={20} />
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-600">NFC / QR</p>
                  <h2 className="text-lg font-bold text-slate-900">Student profile</h2>
                </div>
              </div>
              <button type="button" onClick={() => setSelectedStudent(null)} className="rounded-full bg-slate-100 p-2 text-slate-600 transition hover:bg-slate-200">
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 text-center">
                <div className="mx-auto flex h-28 w-28 items-center justify-center overflow-hidden rounded-full bg-white shadow-inner">
                  {selectedStudent.photo_url ? (
                    <img src={selectedStudent.photo_url.startsWith('http') ? selectedStudent.photo_url : assetUrl(selectedStudent.photo_url)} alt={selectedStudent.name} className="h-full w-full object-cover" />
                  ) : (
                    <UserRound size={38} className="text-indigo-600" />
                  )}
                </div>
                <h3 className="mt-4 text-2xl font-bold text-slate-900">{selectedStudent.name}</h3>
                <p className="mt-1 text-sm text-slate-500">{selectedStudent.reg_number}</p>
                <div className="mt-4 inline-flex rounded-full border border-emerald-200 bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                  {selectedStudent.status || 'Active'}
                </div>
              </div>

              <div className="space-y-5">
                <div className="grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-slate-500">Registration Number</p>
                    <p className="mt-1 font-semibold text-slate-900">{selectedStudent.reg_number}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-slate-500">Class</p>
                    <p className="mt-1 font-semibold text-slate-900">{selectedStudent.class_name}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-slate-500">Gender</p>
                    <p className="mt-1 font-semibold text-slate-900">{selectedStudent.gender}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-slate-500">Status</p>
                    <p className="mt-1 font-semibold text-slate-900">{selectedStudent.status || 'Active'}</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-600">Discipline summary</p>
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-indigo-700">Overall 82%</span>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl bg-white p-3">
                      <p className="text-xs text-slate-500">Merit score</p>
                      <p className="mt-2 text-2xl font-bold text-emerald-600">24</p>
                    </div>
                    <div className="rounded-xl bg-white p-3">
                      <p className="text-xs text-slate-500">Demerit score</p>
                      <p className="mt-2 text-2xl font-bold text-amber-600">6</p>
                    </div>
                    <div className="rounded-xl bg-white p-3">
                      <p className="text-xs text-slate-500">Active permissions</p>
                      <p className="mt-2 text-2xl font-bold text-sky-600">1</p>
                    </div>
                  </div>
                  <div className="mt-4 space-y-2">
                    <div className="rounded-xl bg-white p-3">
                      <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Incident history</p>
                      <p className="mt-2 text-sm text-slate-700">2 resolved incidents · 1 warning issued this term</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteStudent && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-rose-600">Confirmation</p>
            <h2 className="mt-2 text-2xl font-bold text-slate-900">Delete student record?</h2>
            <p className="mt-3 text-slate-600">
              This action will permanently remove <span className="font-semibold text-slate-900">{deleteStudent.name}</span> from the directory.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setDeleteStudent(null)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 font-semibold text-slate-700 transition hover:border-slate-300">
                Cancel
              </button>
              <button type="button" onClick={handleDeleteStudent} className="rounded-xl bg-rose-600 px-4 py-2.5 font-semibold text-white transition hover:bg-rose-500">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default Students;
