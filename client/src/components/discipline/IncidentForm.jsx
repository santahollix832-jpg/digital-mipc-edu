import React, { useEffect, useState } from 'react';
import { AlertCircle, Calendar, Clock, User, FileText, Send, CheckCircle2 } from 'lucide-react';
import { apiFetch } from '../../api/config';

const IncidentForm = () => {
  const [formData, setFormData] = useState({
    studentId: '',
    incidentType: '',
    severity: 'Medium',
    date: new Date().toISOString().split('T')[0],
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
    location: '',
    description: '',
    reportedBy: '',
    actionTaken: ''
  });

  const [students, setStudents] = useState([]);
  const [studentLoadError, setStudentLoadError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const loadStudents = async () => {
      try {
        const response = await apiFetch('/api/students');
        if (!response.ok) {
          throw new Error(`Student list request failed (${response.status})`);
        }
        const studentRecords = await response.json();
        if (!Array.isArray(studentRecords)) {
          throw new Error('Student list response was not a valid list.');
        }
        setStudents(studentRecords);
      } catch (error) {
        console.error('Failed to load students for incident reporting:', error);
        setStudentLoadError('Unable to load students. Please try again later.');
      }
    };

    loadStudents();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      student_id: formData.studentId ? Number(formData.studentId) : '',
      incident_type: formData.incidentType.trim(),
      description: formData.description.trim(),
      reported_by: formData.reportedBy.trim(),
      severity: formData.severity,
      incident_date: formData.date,
      incident_time: formData.time,
      location: formData.location.trim(),
      action_taken: formData.actionTaken.trim(),
    };

    if (
      !payload.student_id ||
      !payload.incident_type ||
      !payload.description ||
      !payload.reported_by
    ) {
      alert('Please fill in all required fields: Student, Type, Description, and Reporter.');
      return;
    }

    try {
      const response = await apiFetch('/api/discipline/incidents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        alert(`Error: ${errorData.message || 'Failed to record incident.'}`);
        return;
      }

      setFormData({
        studentId: '',
        incidentType: '',
        severity: 'Medium',
        date: new Date().toISOString().split('T')[0],
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
        location: '',
        description: '',
        reportedBy: '',
        actionTaken: '',
      });
      alert('Incident report successfully submitted.');
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 3000);
    } catch (error) {
      console.error('Failed to submit incident report:', error);
      alert('Error: Could not connect to the server.');
    }
  };

  const inputClasses = "w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all outline-none";
  const labelClasses = "block text-sm font-semibold text-slate-700 mb-1.5";

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-indigo-600 px-8 py-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <AlertCircle size={24} />
            Record New Discipline Incident
          </h2>
          <p className="text-indigo-100 text-sm mt-1">Please provide accurate details regarding the student infraction.</p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          {submitted && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-lg flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
              <CheckCircle2 className="text-emerald-500" />
              <span className="font-medium">Incident successfully recorded and notified to administration.</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Student Info */}
            <div className="space-y-4">
              <div>
                <label className={labelClasses}>Student ID / Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-3 text-slate-400" size={18} />
                  <select
                    className={`${inputClasses} pl-10`}
                    value={formData.studentId}
                    onChange={(e) => setFormData({...formData, studentId: e.target.value})}
                    required
                    disabled={Boolean(studentLoadError)}
                  >
                    <option value="">Select Student</option>
                    {students.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.name} ({student.reg_number})
                      </option>
                    ))}
                  </select>
                </div>
                {studentLoadError && <p className="mt-1 text-sm text-rose-600">{studentLoadError}</p>}
              </div>

              <div>
                <label className={labelClasses}>Incident Type</label>
                <select 
                  className={inputClasses}
                  value={formData.incidentType}
                  onChange={(e) => setFormData({...formData, incidentType: e.target.value})}
                  required
                >
                  <option value="">Select Category</option>
                  <option value="Academic Misconduct">Academic Misconduct</option>
                  <option value="Behavioral Issue">Behavioral Issue</option>
                  <option value="Dress Code">Dress Code Violation</option>
                  <option value="Attendance">Chronic Tardiness</option>
                  <option value="Property Damage">Property Damage</option>
                  <option value="Bullying">Bullying / Harassment</option>
                </select>
              </div>
            </div>

            {/* Severity and Timing */}
            <div className="space-y-4">
              <div>
                <label className={labelClasses}>Severity Level</label>
                <div className="grid grid-cols-3 gap-3">
                  {['Low', 'Medium', 'High'].map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setFormData({...formData, severity: level})}
                      className={`py-2 rounded-lg border text-sm font-medium transition-all ${
                        formData.severity === level 
                          ? level === 'Low' ? 'bg-emerald-50 border-emerald-500 text-emerald-700 ring-1 ring-emerald-500' 
                          : level === 'Medium' ? 'bg-amber-50 border-amber-500 text-amber-700 ring-1 ring-amber-500'
                          : 'bg-rose-50 border-rose-500 text-rose-700 ring-1 ring-rose-500'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClasses}>Date</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-3 text-slate-400" size={18} />
                    <input 
                      type="date" 
                      className={`${inputClasses} pl-10`}
                      value={formData.date}
                      onChange={(e) => setFormData({...formData, date: e.target.value})}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClasses}>Time</label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-3 text-slate-400" size={18} />
                    <input 
                      type="time" 
                      className={`${inputClasses} pl-10`}
                      value={formData.time}
                      onChange={(e) => setFormData({...formData, time: e.target.value})}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className={labelClasses}>Description of Incident</label>
            <div className="relative">
              <FileText className="absolute left-3 top-3 text-slate-400" size={18} />
              <textarea 
                rows="4" 
                placeholder="Provide detailed context..." 
                className={`${inputClasses} pl-10 resize-none`}
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                required
              ></textarea>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className={labelClasses}>Reported By (Staff Name)</label>
              <input 
                type="text" 
                className={inputClasses}
                placeholder="Staff Member Name"
                value={formData.reportedBy}
                onChange={(e) => setFormData({...formData, reportedBy: e.target.value})}
                required
              />
            </div>
            <div>
              <label className={labelClasses}>Immediate Action Taken</label>
              <input 
                type="text" 
                className={inputClasses}
                placeholder="e.g., Verbal warning, Counseling..."
                value={formData.actionTaken}
                onChange={(e) => setFormData({...formData, actionTaken: e.target.value})}
              />
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-4">
            <button 
              type="button" 
              className="px-6 py-2.5 border border-slate-200 text-slate-600 font-semibold rounded-xl hover:bg-slate-50 transition-all"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="px-8 py-2.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all flex items-center gap-2"
            >
              <Send size={18} />
              Submit Report
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default IncidentForm;
