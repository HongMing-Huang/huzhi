export interface LLMProvider {
  readonly name: string;
  chat(system: string, user: string, signal?: AbortSignal): Promise<string>;
}
