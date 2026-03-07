import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@13.10.0?target=deno'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2023-10-16' })
const endpointSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!
const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

// Map Stripe Price IDs to tier names
const PRICE_TIER_MAP: Record<string, string> = {
    // Replace these with your actual Stripe Price IDs
    'price_REPLACE_plus_monthly': 'plus',
    'price_REPLACE_plus_annual': 'plus',
    'price_REPLACE_pro_monthly': 'pro',
    'price_REPLACE_pro_annual': 'pro',
}

function getTierFromPriceId(priceId: string): string {
    return PRICE_TIER_MAP[priceId] || 'free'
}

serve(async (req) => {
    const body = await req.text()
    const sig = req.headers.get('stripe-signature')

    let event: Stripe.Event
    try {
        event = stripe.webhooks.constructEvent(body, sig!, endpointSecret)
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message)
        return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 400 })
    }

    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object as Stripe.Checkout.Session
                const customerId = session.customer as string
                const subscriptionId = session.subscription as string

                if (subscriptionId) {
                    const subscription = await stripe.subscriptions.retrieve(subscriptionId)
                    const priceId = subscription.items.data[0]?.price?.id
                    const tier = getTierFromPriceId(priceId)
                    const uid = subscription.metadata?.supabase_uid || session.metadata?.supabase_uid

                    // Find profile by stripe_customer_id or supabase_uid
                    let profileFilter = uid
                        ? supabaseAdmin.from('profiles').update({
                            stripe_subscription_id: subscriptionId,
                            subscription_tier: tier,
                            subscription_status: 'active',
                            subscription_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
                        }).eq('id', uid)
                        : supabaseAdmin.from('profiles').update({
                            stripe_subscription_id: subscriptionId,
                            subscription_tier: tier,
                            subscription_status: 'active',
                            subscription_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
                        }).eq('stripe_customer_id', customerId)

                    const { error } = await profileFilter
                    if (error) console.error('Error updating profile on checkout:', error)
                }
                break
            }

            case 'invoice.paid': {
                const invoice = event.data.object as Stripe.Invoice
                const subscriptionId = invoice.subscription as string
                if (!subscriptionId) break

                const subscription = await stripe.subscriptions.retrieve(subscriptionId)
                const priceId = subscription.items.data[0]?.price?.id
                const tier = getTierFromPriceId(priceId)

                const { error } = await supabaseAdmin
                    .from('profiles')
                    .update({
                        subscription_tier: tier,
                        subscription_status: 'active',
                        subscription_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
                    })
                    .eq('stripe_subscription_id', subscriptionId)
                if (error) console.error('Error updating on invoice.paid:', error)
                break
            }

            case 'invoice.payment_failed': {
                const invoice = event.data.object as Stripe.Invoice
                const subscriptionId = invoice.subscription as string
                if (!subscriptionId) break

                const { error } = await supabaseAdmin
                    .from('profiles')
                    .update({ subscription_status: 'past_due' })
                    .eq('stripe_subscription_id', subscriptionId)
                if (error) console.error('Error updating on payment_failed:', error)
                break
            }

            case 'customer.subscription.deleted': {
                const subscription = event.data.object as Stripe.Subscription
                const { error } = await supabaseAdmin
                    .from('profiles')
                    .update({
                        subscription_tier: 'free',
                        subscription_status: 'canceled',
                        stripe_subscription_id: null,
                    })
                    .eq('stripe_subscription_id', subscription.id)
                if (error) console.error('Error updating on subscription.deleted:', error)
                break
            }

            case 'customer.subscription.updated': {
                const subscription = event.data.object as Stripe.Subscription
                const priceId = subscription.items.data[0]?.price?.id
                const tier = getTierFromPriceId(priceId)
                const status = subscription.status === 'active' ? 'active' : subscription.status

                const { error } = await supabaseAdmin
                    .from('profiles')
                    .update({
                        subscription_tier: tier,
                        subscription_status: status,
                        subscription_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
                    })
                    .eq('stripe_subscription_id', subscription.id)
                if (error) console.error('Error updating on subscription.updated:', error)
                break
            }

            default:
                console.log(`Unhandled event type: ${event.type}`)
        }
    } catch (err) {
        console.error('Webhook handler error:', err)
        return new Response(JSON.stringify({ error: 'Handler error' }), { status: 500 })
    }

    return new Response(JSON.stringify({ received: true }), {
        headers: { 'Content-Type': 'application/json' },
    })
})
