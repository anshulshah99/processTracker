import * as vscode from 'vscode';
import { writeFile, writeFileSync } from 'fs';


export interface ProcessEntry {
    action: string; 
    info: string;
    time: string;
}

export interface CodeNavigation {
    action: string;
    start_file: string;
    end_file: string;
}

export class Database {
    private context: vscode.ExtensionContext;
    private entries: ProcessEntry[] | null = null;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        // Initialize storage if empty
        if (!this.context.globalState.get('processEntries')) {
            this.context.globalState.update('processEntries', []);
        }
        // Load entries into memory
        this.entries = this.context.globalState.get<ProcessEntry[]>('processEntries', []);
    }

    private getLocalDateString(): string {
        return new Date(Date.now()).toISOString();
    }

    async addEntry(action: string, info: string) {
        // Validate time spent to prevent unreasonable values

        const dateString = this.getLocalDateString();
        const entries = this.getEntries();
        
        entries.push({ action: action, info: info, time: dateString });
        try {
            await this.updateEntries(entries);
        } catch (error) {
            console.error('Error saving entry:', error);
            vscode.window.showErrorMessage('Failed to save time entry');
        }
    }

    getEntries(): ProcessEntry[] {
        if (!this.entries) {
            this.entries = this.context.globalState.get<ProcessEntry[]>('processEntries', []);
        }
        // console.log(JSON.stringify(this.entries));
        return this.entries;
    }

    private async updateEntries(entries: ProcessEntry[]): Promise<void> {
        this.entries = entries;
        await this.context.globalState.update('processEntries', entries);
        console.log('Entries updated successfully');

    }

    exportEntries() {
        // use https://www.eliostruyf.com/devhack-code-extension-storage-options/
        // to write to files
        const entries = this.getEntries();
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder open');
            return;
        }
        const outputPath = vscode.Uri.joinPath(workspaceFolder.uri, 'process.txt');
        const encrypted = JSON.stringify(entries).split('').map(char => {
            if (/[a-z]/.test(char)) {
            return String.fromCharCode((char.charCodeAt(0) - 97 + 5) % 26 + 97);
            } else if (/[A-Z]/.test(char)) {
            return String.fromCharCode((char.charCodeAt(0) - 65 + 5) % 26 + 65);
            }
            return char;
        }).join('');
        writeFile(outputPath.fsPath, encrypted, (err) => {
            if (err) {
                console.error('Error writing file:', err);
                return;
            }
            console.log('File written successfully!');
        });

    }

    async clearData(): Promise<boolean> {
        try {
            // Clear memory cache
            this.entries = [];
            
            // Clear persistent storage
            await this.context.globalState.update('processEntries', []);
            
            // Show success message
            vscode.window.showInformationMessage('All tracking data has been cleared successfully.');
            return true;
        } catch (error) {
            console.error('Error clearing data:', error);
            vscode.window.showErrorMessage('Failed to clear tracking data: ' + (error instanceof Error ? error.message : 'Unknown error'));
            return false;
        }
    }

}