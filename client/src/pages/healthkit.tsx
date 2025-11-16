import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Activity, Heart, Scale, TrendingUp, AlertCircle, Check, Clock, RefreshCw } from 'lucide-react';
import { HealthKitService } from '@/services/healthkit';
import { logger } from '@/lib/logger';
import { useToast } from '@/hooks/use-toast';
import {
  DAILY_READINESS_DATA_TYPES,
  BODY_COMPOSITION_DATA_TYPES,
  CARDIOMETABOLIC_DATA_TYPES,
  ACTIVITY_DATA_TYPES,
  HEALTH_DATA_TYPE_INFO,
  type HealthDataType,
  type AuthorizationStatus,
} from '@/types/healthkit';

export default function HealthKitPage() {
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthorizationStatus | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    checkAvailability();
  }, []);

  const checkAvailability = async () => {
    const available = await HealthKitService.isAvailable();
    setIsAvailable(available);
  };

  const requestPermissions = async () => {
    setIsRequesting(true);
    
    const allDataTypes: HealthDataType[] = [
      ...DAILY_READINESS_DATA_TYPES,
      ...BODY_COMPOSITION_DATA_TYPES,
      ...CARDIOMETABOLIC_DATA_TYPES,
      ...ACTIVITY_DATA_TYPES,
    ];

    const uniqueDataTypes = Array.from(new Set(allDataTypes));

    const result = await HealthKitService.requestAuthorization({
      read: uniqueDataTypes,
      write: [], // Only request read permissions for now
    });

    if (result) {
      setAuthStatus(result);
      logger.info('HealthKit permissions granted', {
        readAuthorized: result.readAuthorized.length,
      });
      
      toast({
        title: "Permissions Granted",
        description: "You can now sync your health data using the button below.",
      });
    }

    setIsRequesting(false);
  };

  const syncReadinessData = async () => {
    setIsSyncing(true);
    
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7); // Last 7 days

      const dataTypes: HealthDataType[] = [
        ...DAILY_READINESS_DATA_TYPES,
        ...BODY_COMPOSITION_DATA_TYPES,
        ...ACTIVITY_DATA_TYPES,
      ];

      logger.info('Starting readiness data sync for last 7 days...');

      // Query all health data types
      for (const dataType of dataTypes) {
        try {
          const samples = await HealthKitService.readSamples({
            dataType,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            limit: 1000,
          });

          if (samples && samples.length > 0) {
            // Upload to backend
            await fetch('/api/healthkit/samples', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ samples }),
            });
            
            logger.info(`Uploaded ${samples.length} samples for ${dataType}`);
          }
        } catch (error) {
          logger.error(`Failed to sync ${dataType}`, error);
        }
      }

      toast({
        title: "Sync Complete",
        description: "Your health data has been synced successfully.",
      });
      
      logger.info('Readiness data sync completed');
    } catch (error) {
      logger.error('Readiness sync failed', error);
      toast({
        title: "Sync Failed",
        description: "There was an error syncing your health data.",
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const checkPermissions = async () => {
    const allDataTypes: HealthDataType[] = [
      ...DAILY_READINESS_DATA_TYPES,
      ...BODY_COMPOSITION_DATA_TYPES,
      ...CARDIOMETABOLIC_DATA_TYPES,
      ...ACTIVITY_DATA_TYPES,
    ];

    const uniqueDataTypes = Array.from(new Set(allDataTypes));

    const result = await HealthKitService.checkAuthorization({
      read: uniqueDataTypes,
      write: [],
    });

    if (result) {
      setAuthStatus(result);
    }
  };

  useEffect(() => {
    if (isAvailable) {
      checkPermissions();
    }
  }, [isAvailable]);

  if (isAvailable === null) {
    return (
      <div className="flex items-center justify-center h-screen" data-testid="healthkit-loading">
        <div className="text-center">
          <Clock className="w-12 h-12 mx-auto mb-4 animate-spin text-primary" />
          <p className="text-muted-foreground">Checking HealthKit availability...</p>
        </div>
      </div>
    );
  }

  if (!isAvailable) {
    return (
      <div className="container max-w-2xl mx-auto py-8 px-4" data-testid="healthkit-unavailable">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <AlertCircle className="w-6 h-6 text-destructive" />
              <CardTitle>HealthKit Not Available</CardTitle>
            </div>
            <CardDescription>
              Apple HealthKit is not available on this device. HealthKit integration requires:
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• An iOS device (iPhone or iPad)</li>
              <li>• iOS 13.0 or later</li>
              <li>• The Health app installed</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    );
  }

  const hasPermissions = authStatus && authStatus.readAuthorized.length > 0;

  return (
    <div className="container max-w-4xl mx-auto py-8 px-4" data-testid="healthkit-page">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Apple Health Integration</h1>
        <p className="text-muted-foreground">
          Connect your Apple Health data to enhance your health insights
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Connection Status</CardTitle>
          <CardDescription>
            {hasPermissions
              ? 'You have granted Flō access to your health data'
              : 'Connect to Apple Health to unlock personalized insights'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasPermissions ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Check className="w-5 h-5 text-green-600" />
                <span className="font-medium">Connected to Apple Health</span>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground mb-1">Data types authorized:</p>
                  <p className="font-medium">{authStatus.readAuthorized.length}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Status:</p>
                  <Badge variant="default">Active</Badge>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={syncReadinessData}
                  disabled={isSyncing}
                  data-testid="button-sync-readiness"
                  className="flex-1"
                >
                  {isSyncing ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Sync Health Data
                    </>
                  )}
                </Button>
                
                <Button
                  onClick={checkPermissions}
                  variant="outline"
                  size="sm"
                  data-testid="button-refresh-permissions"
                >
                  Refresh
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Grant Flō access to read your health data from Apple Health. This will help us provide
                more accurate and personalized health insights.
              </p>

              <Button
                onClick={requestPermissions}
                disabled={isRequesting}
                data-testid="button-connect-healthkit"
                className="w-full"
              >
                {isRequesting ? 'Requesting Permissions...' : 'Connect Apple Health'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <DataTypeCard
          title="Daily Readiness"
          description="Sleep, HRV, resting heart rate"
          icon={Activity}
          dataTypes={DAILY_READINESS_DATA_TYPES}
          authorized={authStatus?.readAuthorized || []}
        />

        <DataTypeCard
          title="Body Composition"
          description="Weight, body fat, lean mass"
          icon={Scale}
          dataTypes={BODY_COMPOSITION_DATA_TYPES}
          authorized={authStatus?.readAuthorized || []}
        />

        <DataTypeCard
          title="Cardiometabolic"
          description="Heart rate, blood pressure, glucose"
          icon={Heart}
          dataTypes={CARDIOMETABOLIC_DATA_TYPES}
          authorized={authStatus?.readAuthorized || []}
        />

        <DataTypeCard
          title="Activity"
          description="Steps, distance, calories"
          icon={TrendingUp}
          dataTypes={ACTIVITY_DATA_TYPES}
          authorized={authStatus?.readAuthorized || []}
        />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Privacy & Data Usage</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            • Your health data is stored securely and never shared with third parties
          </p>
          <p>
            • You can revoke access at any time through the Apple Health app settings
          </p>
          <p>
            • Data is used solely to provide personalized health insights and recommendations
          </p>
          <p>
            • We only read data you explicitly authorize - nothing more
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

interface DataTypeCardProps {
  title: string;
  description: string;
  icon: any;
  dataTypes: HealthDataType[];
  authorized: HealthDataType[];
}

function DataTypeCard({ title, description, icon: Icon, dataTypes, authorized }: DataTypeCardProps) {
  const authorizedCount = dataTypes.filter(dt => authorized.includes(dt)).length;
  const totalCount = dataTypes.length;
  const allAuthorized = authorizedCount === totalCount && totalCount > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Icon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">{title}</CardTitle>
              <CardDescription className="text-sm">{description}</CardDescription>
            </div>
          </div>
          {allAuthorized && <Check className="w-5 h-5 text-green-600" />}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Authorized</span>
            <span className="font-medium">
              {authorizedCount} / {totalCount}
            </span>
          </div>
          
          <Separator />

          <div className="space-y-1">
            {dataTypes.slice(0, 3).map(dt => (
              <div key={dt} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {HEALTH_DATA_TYPE_INFO[dt]?.description || dt}
                </span>
                {authorized.includes(dt) && (
                  <Check className="w-3 h-3 text-green-600" />
                )}
              </div>
            ))}
            {dataTypes.length > 3 && (
              <p className="text-xs text-muted-foreground italic">
                +{dataTypes.length - 3} more types
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
