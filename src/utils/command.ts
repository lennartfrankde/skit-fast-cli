import { execSync, spawn } from 'child_process';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';

export function executeCommand(command: string, options: { cwd?: string; stdio?: 'pipe' | 'inherit' } = {}): string {
  try {
    const result = execSync(command, {
      cwd: options.cwd || process.cwd(),
      stdio: options.stdio || 'pipe',
      encoding: 'utf8'
    });
    return result.toString().trim();
  } catch (error: any) {
    console.error(chalk.red(`Error executing command: ${command}`));
    console.error(chalk.red(`Command failed: ${command}`));
    if (error.stdout) {
      console.error(chalk.yellow(`STDOUT: ${error.stdout}`));
    }
    if (error.stderr) {
      console.error(chalk.red(`STDERR: ${error.stderr}`));
    }
    console.error(chalk.red(`       Error ${error.message}`));
    throw error;
  }
}

export async function executeCommandAsync(command: string, args: string[], options: { cwd?: string } = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      stdio: 'inherit'
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

export function getCurrentDirectoryName(): string {
  return path.basename(process.cwd());
}

export async function writeTemplateFile(templatePath: string, outputPath: string, variables: Record<string, any> = {}): Promise<void> {
  let content = await fs.readFile(templatePath, 'utf8');
  
  // Simple template variable replacement
  Object.entries(variables).forEach(([key, value]) => {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
    content = content.replace(regex, String(value));
  });
  
  await fs.writeFile(outputPath, content);
  console.log(chalk.green(`✓ Created ${outputPath}`));
}

export function validateUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}