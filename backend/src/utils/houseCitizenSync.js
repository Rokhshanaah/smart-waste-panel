import { pool } from '../config/db.js';

/**
 * Keep houses ↔ customers in sync:
 * - houses.customer_id / owner_name / phone
 * - customers.house_id / address text fields
 */
export async function syncHouseCitizenLink({
  houseId = null,
  customerId = null,
  conn = pool,
} = {}) {
  if (houseId) {
    const [[house]] = await conn.query(
      `SELECT h.*, a.name AS alley_name, p.name AS passage_name, d.name AS district_name
       FROM houses h
       INNER JOIN alleys a ON a.id = h.alley_id
       INNER JOIN passages p ON p.id = a.passage_id
       INNER JOIN districts d ON d.id = p.district_id
       WHERE h.id = ?`,
      [houseId]
    );
    if (!house) return;

    if (house.customer_id) {
      // Clear other customers pointing to this house
      await conn.query(
        `UPDATE customers SET house_id = NULL WHERE house_id = ? AND id <> ?`,
        [houseId, house.customer_id]
      );
      await conn.query(
        `UPDATE customers
         SET house_id = ?, district = ?, street = ?, alley = ?, house_number = ?,
             phone = COALESCE(NULLIF(phone, ''), ?)
         WHERE id = ?`,
        [
          houseId,
          house.district_name,
          house.passage_name,
          house.alley_name,
          house.plate_number,
          house.phone || null,
          house.customer_id,
        ]
      );

      const [[citizen]] = await conn.query(
        `SELECT full_name, phone FROM customers WHERE id = ?`,
        [house.customer_id]
      );
      if (citizen) {
        await conn.query(
          `UPDATE houses SET owner_name = ?, phone = COALESCE(?, phone) WHERE id = ?`,
          [citizen.full_name, citizen.phone || null, houseId]
        );
      }
    }
  }

  if (customerId) {
    const [[citizen]] = await conn.query(`SELECT * FROM customers WHERE id = ?`, [customerId]);
    if (!citizen) return;

    if (citizen.house_id) {
      // Detach this house from other citizens
      await conn.query(
        `UPDATE customers SET house_id = NULL WHERE house_id = ? AND id <> ?`,
        [citizen.house_id, customerId]
      );
      // Detach previous customer_id on other houses for this citizen? set this house's customer_id
      await conn.query(
        `UPDATE houses SET customer_id = NULL WHERE customer_id = ? AND id <> ?`,
        [customerId, citizen.house_id]
      );

      const [[house]] = await conn.query(
        `SELECT h.*, a.name AS alley_name, p.name AS passage_name, d.name AS district_name
         FROM houses h
         INNER JOIN alleys a ON a.id = h.alley_id
         INNER JOIN passages p ON p.id = a.passage_id
         INNER JOIN districts d ON d.id = p.district_id
         WHERE h.id = ?`,
        [citizen.house_id]
      );

      if (house) {
        await conn.query(
          `UPDATE houses
           SET customer_id = ?, owner_name = ?, phone = COALESCE(?, phone)
           WHERE id = ?`,
          [customerId, citizen.full_name, citizen.phone || null, citizen.house_id]
        );
        await conn.query(
          `UPDATE customers
           SET district = ?, street = ?, alley = ?, house_number = ?
           WHERE id = ?`,
          [
            house.district_name,
            house.passage_name,
            house.alley_name,
            house.plate_number,
            customerId,
          ]
        );
      }
    } else {
      // Citizen cleared house — clear reverse link if any house still points here
      await conn.query(
        `UPDATE houses SET customer_id = NULL WHERE customer_id = ?`,
        [customerId]
      );
    }
  }
}

export async function attachCitizenToHouse(houseId, customerId, conn = pool) {
  const id = Number(customerId) || null;
  await conn.query(`UPDATE houses SET customer_id = ? WHERE id = ?`, [id, houseId]);
  if (id) {
    await conn.query(`UPDATE customers SET house_id = NULL WHERE house_id = ? AND id <> ?`, [houseId, id]);
    await conn.query(`UPDATE customers SET house_id = ? WHERE id = ?`, [houseId, id]);
    await syncHouseCitizenLink({ houseId, customerId: id, conn });
  } else {
    await conn.query(`UPDATE customers SET house_id = NULL WHERE house_id = ?`, [houseId]);
    await conn.query(
      `UPDATE houses SET owner_name = NULL WHERE id = ? AND customer_id IS NULL`,
      [houseId]
    );
  }
}
