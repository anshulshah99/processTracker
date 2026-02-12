// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

import { Database } from './database';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    // Only enable extension if workspace path contains specific strings
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        console.log('ProcessTracker: No workspace folder found, extension not activated');
        return;
    }

    const allowedStrings = ['homeworkassignments', 'cpython', 'idlelib', 'open-refine', 'openrefine'];
    const isAllowed = workspaceFolders.some(folder => 
        allowedStrings.some(str => folder.uri.fsPath.toLowerCase().includes(str))
    );

    if (!isAllowed || workspaceFolders.some(folder => folder.uri.fsPath.toLowerCase().includes('group'))) {
        console.log('ProcessTracker: Workspace path does not contain required strings, extension not activated');
        return;
    }

    console.log('ProcessTracker: Extension activated');
    const database = new Database(context);

    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
        const fileName = activeEditor.document.fileName;
        database.addEntry("Current File", fileName);
    }
    
    // Session variable to store entries before batch writing
    let sessionEntries: Array<{ action: string; info: string }> = [];

    // Function to add entry to session
    const addToSession = (action: string, info: string) => {
        sessionEntries.push({ action, info });
    };

    // Function to flush session entries to database
    const flushSession = async () => {
        if (sessionEntries.length > 0) {
            for (const entry of sessionEntries) {
                await database.addEntry(entry.action, entry.info);
            }
            sessionEntries = []; // Clear session after writing
        }
    };

    vscode.workspace.onDidOpenTextDocument(async (document) => {
        // OPEN FILE
        // Ignore .git files
        if (document.fileName.endsWith('.git')) {
            return;
        }
        
        // Flush previous session entries first
        addToSession("openFile", `filename: ${document.fileName.split('/').slice(-4).join('/')}`);
        
    });

    vscode.workspace.onDidCloseTextDocument(async (document) => {
        // CLOSE FILE
        // Ignore .git files
        if (document.fileName.endsWith('.git')) {
            return;
        }
        
        addToSession("closeFile", `filename: ${document.fileName.split('/').slice(-4).join('/')}`);
    });

    vscode.window.onDidChangeTextEditorSelection((change) => {
    	// CURSOR CHANGES
        if (change.kind === 3){
            addToSession("selectionChange", `kind: command; selection: ${change.selections[0].start.line + 1} to ${change.selections[0].end.line + 1}; line: ${getLineAtPosition(change.selections[0].active)}`);
        }
        
    });

    vscode.workspace.onDidChangeTextDocument((document) => {
        // TEXT CHANGES
        addToSession("contentChange", `line: ${JSON.stringify(document.contentChanges[0].range.start.line)}; text: "${document.contentChanges[0].text}"`);
    });    
    
    vscode.window.onDidChangeTextEditorVisibleRanges((document) => {
        // SCROLLING
        addToSession("visibleRangeChange", `lines: ${document.visibleRanges[0].start.line} to ${document.visibleRanges[0].end.line}`);
    });  
    
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
        // ACTIVE EDITOR CHANGED
        if (editor) {
            addToSession("activeEditorChange", `filename: ${editor?.document.fileName.split('/').slice(-4).join('/')}`);
        }
        await flushSession();
    });

    vscode.debug.onDidChangeBreakpoints((event) => {
        // BREAKPOINT CHANGES
        console.log(event);
        addToSession("breakpointChange", `added: ${event.added}; removed: ${event.removed}; changed: ${event.changed}`);
    });

    vscode.debug.onDidChangeActiveDebugSession((session) => {
        // ACTIVE DEBUG SESSION CHANGED
        addToSession("activeDebugSessionChange", `${session?.name}`);
    });
        
    vscode.window.onDidChangeTerminalState((terminal) => {
        // TERMINAL STATE CHANGED
        // console.log(`Terminal state changed: ${terminal.name}, isActive: ${terminal.state}`);
        addToSession("terminalStateChange", `name: ${terminal.name}; isActive: ${terminal.state}`);
    });

    vscode.window.onDidStartTerminalShellExecution(async (event) => {
        // TERMINAL COMMAND STARTED
        const commandLine = event.execution.commandLine.value;
        //console.log(`Terminal command started: ${commandLine}`);
        addToSession("terminalCommandStarted", `command: ${commandLine}`);
        await flushSession();
    });
    
    vscode.languages.registerDefinitionProvider({ scheme: '*' }, {
        provideDefinition: (document, position) => {
            const filename = document.fileName;
            const range = document.getWordRangeAtPosition(position);
            const sourceSymbol = range ? document.getText(range) : '';
            const sourceLine = position.line + 1;
            
            // Track the source symbol/line
            const sourceInfo = `${sourceSymbol}:${sourceLine}`;
            addToSession("goToDefinition", `info: ${sourceInfo}; filename: ${filename}`);
            return null;
        }
    });

    vscode.languages.registerReferenceProvider({ scheme: '*' }, {
        provideReferences: (document, position) => {
            const filename = document.fileName;
            const range = document.getWordRangeAtPosition(position);
            const sourceSymbol = range ? document.getText(range) : '';
            const sourceLine = position.line + 1;
            
            // Track the source symbol/line
            const sourceInfo = `${sourceSymbol}:${sourceLine}`;
            addToSession("goToReferences", `info: ${sourceInfo}; filename: ${filename}`);
            return null;
        }
    });

    // Capture the destination when selection changes after navigation
    // vscode.window.onDidChangeTextEditorSelection((event) => {        
    //     const editor = event.textEditor;
    //     const position = event.selections[0].active;
    //     const kind = event.kind ? ChangeKindMap[event.kind] : "undefined";
    //     const fileName = editor.document.fileName;
    //     const lineNumber = position.line + 1;
    //     const cursorPosition = editor.document.offsetAt(position);
    //     const cursorLineContent = editor.document.lineAt(position.line).text;
    //     addToSession("navigationDestination", `${kind}:${fileName}:${lineNumber}:${cursorPosition}:${cursorLineContent.trim()}`);

    // });

    let exportCommand = vscode.commands.registerCommand('processtracker.exportData', async () => {
        await flushSession();
        database.exportEntries();
    });

    let clearCommand = vscode.commands.registerCommand('processtracker.clearData', () => {
        database.clearData();
    });

    context.subscriptions.push(exportCommand);
    context.subscriptions.push(clearCommand);

    // Function to get line content at cursor position
    const getLineAtPosition = (position: vscode.Position): string => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return '';
        }
        return editor.document.lineAt(position.line).text;
    };
}

// This method is called when your extension is deactivated
export function deactivate() {

}
