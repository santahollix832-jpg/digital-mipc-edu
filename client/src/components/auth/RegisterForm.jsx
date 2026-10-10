import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, UserPlus } from 'lucide-react';
import './RegisterForm.css';

const availableRoles = ['PATRON', 'BURSAR', 'TEACHER', 'ADMIN'];

function RegisterForm({ onSubmit, submitting, error }) {
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('TEACHER');

  function handleSubmit(event) {
    event.preventDefault();
    onSubmit({
      username: username.trim(),
      full_name: fullName.trim(),
      password,
      role,
    });
  }

  return (
    <main className="mipc-register">
      <div className="mipc-register__grid" aria-hidden="true" />
      <section className="mipc-register__panel">
        <header className="mipc-register__header">
          <span className="mipc-register__mark">M</span>
          <div>
            <p>DIGITAL MIPC EDU</p>
            <h1>Create staff account</h1>
            <span>Accounts are provisioned by an administrator.</span>
          </div>
        </header>

        <form className="mipc-register__form" onSubmit={handleSubmit}>
          <label>
            FULL NAME
            <input
              autoComplete="name"
              maxLength={150}
              onChange={event => setFullName(event.target.value)}
              required
              value={fullName}
            />
          </label>

          <label>
            USERNAME OR EMAIL
            <input
              autoCapitalize="none"
              autoComplete="username"
              maxLength={254}
              onChange={event => setUsername(event.target.value)}
              pattern="[A-Za-z0-9._@+-]+"
              required
              value={username}
            />
          </label>

          <label>
            ACCOUNT ROLE
            <select onChange={event => setRole(event.target.value)} value={role}>
              {availableRoles.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>

          <label>
            INITIAL PASSWORD
            <input
              autoComplete="new-password"
              maxLength={72}
              minLength={12}
              onChange={event => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
            <small>Use at least 12 characters.</small>
          </label>

          {error && <p className="mipc-register__error" role="alert">{error}</p>}

          <button disabled={submitting} type="submit">
            <UserPlus size={17} />
            {submitting ? 'CREATING ACCOUNT…' : 'CREATE ACCOUNT'}
          </button>
        </form>

        <Link className="mipc-register__back" to="/login">
          <ArrowLeft size={15} /> Return to sign in
        </Link>
      </section>
      <p className="mipc-register__notice">RESTRICTED · ADMINISTRATOR AUTHORIZATION REQUIRED</p>
    </main>
  );
}

export default RegisterForm;
