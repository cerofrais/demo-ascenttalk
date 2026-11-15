'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';

export default function ForgotPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await api.post('/auth/forgot', { email }).catch(() => undefined);
    setSent(true);
    setLoading(false);
  };
  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Reset password</h1>
        <p className="mt-1 text-sm text-fg-3">We'll email you a reset link. If email isn't set up, ask an admin to reset it for you.</p>
      </div>
      {sent ? (
        <p className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success">If an account exists for {email}, a reset link is on its way.</p>
      ) : (
        <>
          <Field label="Work email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Button type="submit" className="w-full" loading={loading}>
            Send reset link
          </Button>
        </>
      )}
      <p className="text-center text-sm">
        <Link href="/login" className="text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
