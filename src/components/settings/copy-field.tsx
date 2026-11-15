'use client';
import { useState } from 'react';
import { CheckCircle2, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export function CopyField({ label, value, mono = true }: { label?: string; value: string; mono?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <div>
      {label && <p className="mb-1 text-[13px] font-medium">{label}</p>}
      <div className="flex items-stretch gap-2">
        <code className={cn('min-w-0 flex-1 overflow-x-auto rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs whitespace-pre', !mono && 'font-sans')}>{value}</code>
        <Button
          variant="outline"
          size="icon"
          aria-label="Copy"
          onClick={() => {
            navigator.clipboard.writeText(value).then(() => {
              setDone(true);
              setTimeout(() => setDone(false), 1500);
            });
          }}
        >
          {done ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
