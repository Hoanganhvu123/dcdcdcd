import React from 'react';
import Head from 'next/head';
import { OpenWorkShell } from '@/components/openwork/OpenWorkShell';

export default function OpenWorkPage() {
  return (
    <>
      <Head>
        <title>OpenWork Coworker | DB-GPT Enterprise Analytics</title>
        <meta
          name="description"
          content="Enterprise Autonomous Multi-Agent Coworker Workspace powered by DeepSeek V4 and DB-GPT"
        />
      </Head>
      <div className="h-screen w-screen overflow-hidden bg-background text-foreground">
        <OpenWorkShell />
      </div>
    </>
  );
}
