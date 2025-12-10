import React from 'react';
import WebDAVIntegration from './WebDAVIntegration';
import { t } from '../../../utils/i18n';

const WebDAVIntegrationPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-cyan-50 to-blue-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
              </svg>
            </div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 via-cyan-900 to-blue-900 dark:from-gray-100 dark:via-cyan-100 dark:to-blue-100 bg-clip-text text-transparent">
              {t('webdavIntegration')}
            </h1>
          </div>
          <p className="text-lg text-gray-600 dark:text-gray-300 max-w-3xl">
            {t('webdavIntegrationDescription')}
          </p>
        </div>
        
        <WebDAVIntegration />
      </div>
    </div>
  );
};

export default WebDAVIntegrationPage;

