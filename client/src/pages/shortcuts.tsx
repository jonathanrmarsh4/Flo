import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Copy, RefreshCw, Shield, Check, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ApiKeyInfo {
  hasKey: boolean;
  id?: string;
  name?: string;
  createdAt?: string;
  lastUsedAt?: string | null;
}

interface ShortcutTemplate {
  id: string;
  name: string;
  eventType: string;
  details: any;
  description: string;
}

const SHORTCUT_TEMPLATES: ShortcutTemplate[] = [
  {
    id: 'alcohol',
    name: 'Log Alcohol',
    eventType: 'alcohol',
    details: { drinks: 1, type: 'beer' },
    description: 'Quick log when you have a drink',
  },
  {
    id: 'ice_bath',
    name: 'Log Ice Bath',
    eventType: 'ice_bath',
    details: { duration_min: 3, temp_c: 7 },
    description: 'Log ice bath or cold plunge',
  },
  {
    id: 'sauna',
    name: 'Log Sauna',
    eventType: 'sauna',
    details: { duration_min: 15 },
    description: 'Log sauna session',
  },
  {
    id: 'trt',
    name: 'Log TRT 0.10ml',
    eventType: 'supplements',
    details: { 
      names: ['Testosterone'], 
      dosage: { amount: 0.10, unit: 'ml' } 
    },
    description: 'Log your TRT dose',
  },
  {
    id: 'coffee',
    name: 'Log Morning Coffee',
    eventType: 'caffeine',
    details: { source: 'coffee', cups: 1 },
    description: 'Log caffeine intake',
  },
  {
    id: 'late_meal',
    name: 'Ate Late',
    eventType: 'late_meal',
    details: { hour: 22 },
    description: 'Log late night eating',
  },
];

export default function ShortcutsPage() {
  const { toast } = useToast();
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copiedTemplate, setCopiedTemplate] = useState<string | null>(null);

  // Fetch API key info
  const { data: keyInfo, isLoading } = useQuery<ApiKeyInfo>({
    queryKey: ['/api/user/api-key'],
  });

  // Generate API key mutation
  const generateKeyMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/user/api-key/generate', {});
      return response.json();
    },
    onSuccess: (data: any) => {
      setGeneratedKey(data.apiKey);
      queryClient.invalidateQueries({ queryKey: ['/api/user/api-key'] });
      toast({
        title: 'API Key Generated',
        description: 'Save this key securely. You won\'t be able to see it again.',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to generate API key',
        variant: 'destructive',
      });
    },
  });

  // Revoke API key mutation
  const revokeKeyMutation = useMutation({
    mutationFn: () => apiRequest('DELETE', '/api/user/api-key'),
    onSuccess: () => {
      setGeneratedKey(null);
      queryClient.invalidateQueries({ queryKey: ['/api/user/api-key'] });
      toast({
        title: 'API Key Revoked',
        description: 'Your API key has been deleted.',
      });
    },
  });

  const copyToClipboard = (text: string, type: 'key' | 'template') => {
    navigator.clipboard.writeText(text);
    if (type === 'key') {
      toast({ title: 'Copied', description: 'API key copied to clipboard' });
    } else {
      setCopiedTemplate(text);
      setTimeout(() => setCopiedTemplate(null), 2000);
      toast({ title: 'Copied', description: 'Shortcut template copied' });
    }
  };

  const generateShortcutJSON = (template: ShortcutTemplate, apiKey: string) => {
    return JSON.stringify({
      url: 'https://get-flo.com/api/life-events',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: {
        eventType: template.eventType,
        details: template.details,
      },
    }, null, 2);
  };

  if (isLoading) {
    return <div className="container mx-auto p-6">Loading...</div>;
  }

  const displayKey = generatedKey || (keyInfo?.hasKey ? '••••••••••••••••••••' : null);

  return (
    <div className="container mx-auto p-6 max-w-4xl" data-testid="page-shortcuts">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">iOS Shortcuts</h1>
        <p className="text-muted-foreground">
          Create home screen buttons to instantly log events to Flō without opening the app
        </p>
      </div>

      {/* API Key Section */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Your API Key
          </CardTitle>
          <CardDescription>
            This key authenticates iOS Shortcuts to log events to your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          {displayKey ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-muted p-3 rounded-md font-mono text-sm">
                  {displayKey}
                </code>
                {generatedKey && (
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => copyToClipboard(generatedKey, 'key')}
                    data-testid="button-copy-key"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                )}
              </div>
              
              {generatedKey && (
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-md p-4">
                  <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
                    Save this key now! You won't be able to see it again.
                  </p>
                </div>
              )}
              
              {keyInfo?.hasKey && !generatedKey && (
                <div className="text-sm text-muted-foreground">
                  <p>Created: {keyInfo.createdAt ? new Date(keyInfo.createdAt).toLocaleDateString() : 'Unknown'}</p>
                  <p>Last used: {keyInfo.lastUsedAt ? new Date(keyInfo.lastUsedAt).toLocaleString() : 'Never'}</p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground">
              Generate an API key to use with iOS Shortcuts
            </p>
          )}
        </CardContent>
        <CardFooter className="gap-2">
          <Button
            onClick={() => generateKeyMutation.mutate()}
            disabled={generateKeyMutation.isPending}
            data-testid="button-generate-key"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            {keyInfo?.hasKey ? 'Regenerate Key' : 'Generate Key'}
          </Button>
          
          {keyInfo?.hasKey && (
            <Button
              variant="outline"
              onClick={() => revokeKeyMutation.mutate()}
              disabled={revokeKeyMutation.isPending}
              data-testid="button-revoke-key"
            >
              Revoke Key
            </Button>
          )}
        </CardFooter>
      </Card>

      <Separator className="my-8" />

      {/* Shortcut Templates */}
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold mb-2">Pre-built Shortcuts</h2>
          <p className="text-muted-foreground mb-4">
            Copy these templates to create instant-log buttons on your iPhone
          </p>
        </div>

        {!displayKey && (
          <Card className="bg-muted">
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground">
                Generate an API key above to use these shortcut templates
              </p>
            </CardContent>
          </Card>
        )}

        {displayKey && (
          <div className="grid gap-4">
            {SHORTCUT_TEMPLATES.map((template) => {
              const jsonConfig = generatedKey ? generateShortcutJSON(template, generatedKey) : '';
              const isCopied = copiedTemplate === jsonConfig;
              
              return (
                <Card key={template.id}>
                  <CardHeader>
                    <CardTitle>
                      {template.name}
                    </CardTitle>
                    <CardDescription>{template.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-muted p-3 rounded-md overflow-x-auto">
                      <pre className="text-xs font-mono">
                        {generatedKey ? jsonConfig : 'Generate an API key to see configuration'}
                      </pre>
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyToClipboard(jsonConfig, 'template')}
                      disabled={!generatedKey}
                      data-testid={`button-copy-${template.id}`}
                    >
                      {isCopied ? (
                        <>
                          <Check className="h-4 w-4 mr-2" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4 mr-2" />
                          Copy Configuration
                        </>
                      )}
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Separator className="my-8" />

      {/* Setup Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Setup Instructions</CardTitle>
          <CardDescription>How to create iOS Shortcuts</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-semibold mb-2">1. Open iOS Shortcuts App</h3>
            <p className="text-sm text-muted-foreground">
              Find the blue Shortcuts app on your iPhone (pre-installed on iOS 13+)
            </p>
          </div>
          
          <div>
            <h3 className="font-semibold mb-2">2. Create New Shortcut</h3>
            <p className="text-sm text-muted-foreground">
              Tap the + button to create a new shortcut
            </p>
          </div>
          
          <div>
            <h3 className="font-semibold mb-2">3. Add "Get Contents of URL" Action</h3>
            <p className="text-sm text-muted-foreground">
              Search for "Get Contents of URL" and add it
            </p>
          </div>
          
          <div>
            <h3 className="font-semibold mb-2">4. Configure the Request</h3>
            <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
              <li>URL: <code className="bg-muted px-1 rounded">https://get-flo.com/api/life-events</code></li>
              <li>Method: <code className="bg-muted px-1 rounded">POST</code></li>
              <li>Add Header: <code className="bg-muted px-1 rounded">Authorization</code> = <code className="bg-muted px-1 rounded">Bearer YOUR_API_KEY</code></li>
              <li>Add Header: <code className="bg-muted px-1 rounded">Content-Type</code> = <code className="bg-muted px-1 rounded">application/json</code></li>
              <li>Request Body: Paste the JSON from template above</li>
            </ul>
          </div>
          
          <div>
            <h3 className="font-semibold mb-2">5. Add to Home Screen</h3>
            <p className="text-sm text-muted-foreground">
              Tap the shortcut name → Details → Add to Home Screen
            </p>
          </div>
          
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-md p-4">
            <p className="text-sm font-medium text-blue-700 dark:text-blue-400">
              💡 Tip: Give each shortcut an emoji icon and descriptive name like "🍺 Log Beer"
            </p>
          </div>
        </CardContent>
        <CardFooter>
          <Button
            variant="outline"
            asChild
          >
            <a
              href="https://support.apple.com/guide/shortcuts/welcome/ios"
              target="_blank"
              rel="noopener noreferrer"
              data-testid="link-shortcuts-help"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              iOS Shortcuts Guide
            </a>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
