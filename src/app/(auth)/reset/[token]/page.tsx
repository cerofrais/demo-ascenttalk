'use client';
import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';

export default function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/auth/reset', { token, password });
      router.replace('/inbox');
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-5">
      <h1 className="text-xl font-semibold">Set a new password</h1>
      <Field label="New password" hint="At least 8 characters">
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required autoComplete="new-password" />
      </Field>
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button type="submit" className="w-full" loading={loading}>
        Update password
      </Button>
    </form>
  );
}
