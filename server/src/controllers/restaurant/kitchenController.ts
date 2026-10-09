import { Request, Response } from 'express'
import { query } from '../../db/pool'

// Kitchen Display: every order that has food being cooked or waiting for pickup, as one ticket per order.
// Items still "pending" (rung up but not yet sent) never show — only what the waiter sent to the kitchen.
export async function getKitchen(req: Request, res: Response) {
  const { branchId } = req.auth!
  const { rows } = await query(
    `SELECT o.id, o.order_ref, o.call_no, o.order_type, o.status, o.notes,
            t.table_number,
            NULLIF(TRIM(COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, '')), '') AS waiter_name,
            MIN(COALESCE(ol.sent_to_kitchen, ol.created_at)) AS sent_at,
            json_agg(json_build_object(
              'id', ol.id, 'name', ol.item_name_snap, 'quantity', ol.quantity, 'status', ol.status,
              'special_request', ol.special_request, 'ready_at', ol.ready_at,
              'category', mc.name, 'prep_minutes', mi.prep_time_minutes,
              'modifiers', COALESCE((SELECT json_agg(m.modifier_name ORDER BY m.modifier_name) FROM order_line_modifier m
                                     WHERE m.order_line_id = ol.id AND m.deleted_at IS NULL), '[]'::json)
            ) ORDER BY ol.created_at) AS lines
     FROM order_header o
     JOIN order_line ol      ON ol.order_id = o.id AND ol.deleted_at IS NULL AND ol.status IN ('preparing','ready')
     LEFT JOIN menu_item mi     ON mi.id = ol.menu_item_id
     LEFT JOIN menu_category mc ON mc.id = mi.category_id
     LEFT JOIN dining_table t   ON t.id = o.dining_table_id
     LEFT JOIN staff s          ON s.id = o.server_staff_id
     WHERE o.branch_id = $1 AND o.deleted_at IS NULL AND o.status IN ('open','preparing','ready','served')
     GROUP BY o.id, t.table_number, s.first_name, s.last_name
     ORDER BY MIN(COALESCE(ol.sent_to_kitchen, ol.created_at))`,
    [branchId]
  )

  const tickets = rows.map((r: any) => {
    const cooking = r.lines.filter((l: any) => l.status === 'preparing').length
    return {
      ...r,
      cooking_count: cooking,
      stage: cooking > 0 ? 'cooking' : 'ready',
      prep_minutes: Math.max(0, ...r.lines.map((l: any) => Number(l.prep_minutes) || 0)),
    }
  })
  return res.json({
    success: true,
    data: {
      tickets,
      categories: [...new Set(tickets.flatMap((t: any) => t.lines.map((l: any) => l.category).filter(Boolean)))].sort(),
      server_time: new Date().toISOString(),
    },
  })
}
