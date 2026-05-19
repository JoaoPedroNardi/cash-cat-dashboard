import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useBillingDates } from '@/hooks/use-billing-dates'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'

export const Route = createFileRoute('/_authenticated/billing-settings')({
  component: BillingSettingsPage,
})

function BillingSettingsPage() {
  const { user } = useAuth()
  const { records, loading, upsert, remove } = useBillingDates()
  const [editingAccount, setEditingAccount] = useState<string | null>(null)
  const [closingDay, setClosingDay] = useState(10)
  const [dueDay, setDueDay] = useState(20)
  const [isOpen, setIsOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data } = await supabase.from('accounts').select('*').eq('user_id', user.id)
      return data || []
    },
    enabled: !!user,
  })

  const handleSave = async () => {
    if (!editingAccount) return
    setSaving(true)
    const result = await upsert(editingAccount, closingDay, dueDay)
    setSaving(false)
    if (result.success) {
      toast.success('Salvo!')
      setIsOpen(false)
      setEditingAccount(null)
    } else {
      toast.error('Erro')
    }
  }

  const getRecord = (accountId: string) => records.find((r) => r.account_id === accountId)

  const handleEdit = (record: any) => {
    setEditingAccount(record.account_id)
    setClosingDay(record.closing_day)
    setDueDay(record.due_day)
    setIsOpen(true)
  }

  if (loading) return <div>Carregando...</div>

  return (
    <div className="max-w-3xl mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Datas de Fatura</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {accounts.map((acc) => {
              const rec = getRecord(acc.id)
              return (
                <div key={acc.id} className="flex justify-between items-center p-3 border rounded">
                  <div>
                    <p className="font-medium">{acc.name}</p>
                    {rec && <p className="text-sm text-muted-foreground">Fecha {rec.closing_day}º, vence {rec.due_day}º</p>}
                  </div>
                  <Button variant="outline" size="sm" onClick={() => (rec ? handleEdit(rec) : setEditingAccount(acc.id), setIsOpen(true))}>
                    {rec ? 'Editar' : 'Configurar'}
                  </Button>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configurar Fatura</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Dia Fechamento</Label>
              <Input type="number" min="1" max="28" value={closingDay} onChange={(e) => setClosingDay(parseInt(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label>Dia Vencimento</Label>
              <Input type="number" min="1" max="28" value={dueDay} onChange={(e) => setDueDay(parseInt(e.target.value))} />
            </div>
            <Button onClick={handleSave} disabled={saving} className="w-full">
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}