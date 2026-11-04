/* One row per violation. Zero rows means the ledger is clean.
   Split across statements: this SQLite build allows five compound terms. */
select 'wager_stake_count' as violation, w.id as entity_id, cast(count(c.id) as text) as detail
from wagers w
left join credit_entries c on c.wager_id = w.id and c.kind = 'stake'
group by w.id
having count(c.id) != 1
union all
select 'stake_amount', c.id, cast(c.amount as text)
from credit_entries c
join wagers w on w.id = c.wager_id
where c.kind = 'stake' and c.amount != -w.stake
union all
select 'return_count', c.wager_id, cast(count(*) as text)
from credit_entries c
where c.kind = 'return' and c.wager_id is not null
group by c.wager_id
having count(*) > 1
union all
select 'orphan_stake', c.id, coalesce(c.wager_id, '')
from credit_entries c
left join wagers w on w.id = c.wager_id
where c.kind = 'stake'
  and (c.wager_id is null or w.id is null or w.user_id != c.user_id);

select 'grant_count' as violation, user_id as entity_id, cast(count(*) as text) as detail
from credit_entries
where kind = 'grant'
group by user_id
having count(*) > 1
union all
select 'negative_balance', user_id, cast(sum(amount) as text)
from credit_entries
group by user_id
having sum(amount) < 0
union all
select 'return_outcome', id, kind || ':' || coalesce(outcome, '')
from credit_entries
where (kind = 'return' and outcome is null)
   or (kind != 'return' and outcome is not null);
