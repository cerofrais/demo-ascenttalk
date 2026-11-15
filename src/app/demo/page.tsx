import { notFound } from 'next/navigation';
import { DemoPicker } from './picker';

export const metadata = { title: 'Demo' };

/** The demo's front door: choose whose eyes to look through. Only exists in demo builds. */
export default function DemoPage() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== 'true') notFound();
  return <DemoPicker />;
}
