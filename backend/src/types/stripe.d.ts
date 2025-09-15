import Stripe from 'stripe';

declare module 'stripe' {
  namespace Stripe {
    interface Stripe {
      request(options: {
        method: 'GET' | 'POST' | 'PUT' | 'DELETE';
        path: string;
        data?: object;
      }): Promise<any>;
    }
  }
}