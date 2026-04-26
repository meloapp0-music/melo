import { useState } from 'react';
import SignIn from '../pages/auth/SignIn';
import SignUp from '../pages/auth/SignUp';

// Simple toggle between SignIn and SignUp. Kept separate from App.jsx so
// the session state machine stays readable.
export default function AuthGate() {
  const [mode, setMode] = useState('signIn');
  const toggle = () => setMode((m) => (m === 'signIn' ? 'signUp' : 'signIn'));
  return mode === 'signIn'
    ? <SignIn onToggle={toggle} />
    : <SignUp onToggle={toggle} />;
}
