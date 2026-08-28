import React from 'react';
import { FolderGit2 } from 'lucide-react';
import { Empty, Panel } from './ui';

export const GITHUB_VIEWS = ['github'];

// An empty category, on purpose. The group and its gate are real — only the
// accounts named in PRIVATE_GROUPS on the server can reach it — and there is
// nothing in it yet.
export default function GithubPanel() {
  return (
    <Panel title="GitHub" icon={FolderGit2}>
      <Empty>Nothing here yet.</Empty>
    </Panel>
  );
}
