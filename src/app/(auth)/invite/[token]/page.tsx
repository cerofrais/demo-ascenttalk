'use client';
import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const [info, setInfo] = useState<{ email: string; name: string; agency: string } | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    api
      .get<{ email: string; name: string; agency: string }>(`/auth/invite/${token}`)
      .then((i) => {
        setInfo(i);
        setName(i.name);
      })
      .catch((e) => setError(e.message));
  }, [token]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/auth/invite/accept', { token, name, password });
      router.replace('/inbox');
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };
  if (error && !info) return <p className="text-sm text-danger">{error}</p>;
  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Join {info?.agency ?? 'your team'}</h1>
        <p className="mt-1 text-sm text-fg-3">{info?.email}</p>
      </div>
      <Field label="Your name">
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </Field>
      <Field label="Choose a password" hint="At least 8 characters">
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required autoComplete="new-password" />
      </Field>
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button type="submit" className="w-full" loading={loading} disabled={!info}>
        Create account
      </Button>
    </form>
  );
}
