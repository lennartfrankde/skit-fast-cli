#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { createProject } from './commands/create';

const program = new Command();

program
  .name('skit-fast')
  .description('Fast SvelteKit project starter with Coolify deployment integration')
  .version('1.0.0');

program
  .command('create')
  .description('Create a new SvelteKit project')
  .action(async () => {
    try {
      await createProject();
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

// Default command
program
  .action(async () => {
    try {
      await createProject();
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

program.parse();