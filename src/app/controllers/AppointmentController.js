import * as Yup from 'yup';
import { startOfHour, parseISO, isBefore, format } from 'date-fns';
import pt from 'date-fns/locale/pt';
import Appointments from '../models/Appointment';
import Notification from '../schemas/Notification';
import User from '../models/User';
import File from '../models/File';

class AppointmentController {
  async index(req, res) {
    const { page = 1 } = req.query;

    const appointments = await Appointments.findAll({
      where: { user_id: req.userId },
      order: ['date'],
      limit: 20,
      offset: (page - 1) * 20,
      attributes: ['id', 'date'],
      include: [
        {
          model: User,
          as: 'provider',
          attributes: ['id', 'name'],
          include: [
            {
              model: File,
              as: 'avatar',
              attributes: ['url', 'id', 'path'],
            },
          ],
        },
      ],
    });

    return res.json(appointments);
  }

  async store(req, res) {
    const schema = Yup.object().shape({
      provider_id: Yup.number().required(),
      date: Yup.date().required(),
    });

    if (!(await schema.isValid(req.body))) {
      return res.status(400).json({ error: 'Validation fails' });
    }

    /**
     *  Check if user is the same
     */
    const { provider_id, date } = req.body;

    const isEqual = provider_id === req.userId;

    if (isEqual) {
      return res
        .status(401)
        .json({ error: 'You can not create appointments for you' });
    }

    /**
     *  Check if provider_id is a provider
     */

    const isProvider = await User.findOne({
      where: { id: provider_id, provider: true },
    });

    if (!isProvider) {
      return res
        .status(401)
        .json({ error: 'You can only create appointments with providers' });
    }

    /**
     * Check for past dates
     */
    const hoursStart = startOfHour(parseISO(date));

    if (isBefore(hoursStart, new Date())) {
      return res.status(400).json({ error: 'Past date is not permited' });
    }

    /**
     * Check date availability
     */

    const isAvailability = await Appointments.findOne({
      where: {
        provider_id,
        canceled_at: null,
        date: hoursStart,
      },
    });

    if (isAvailability) {
      return res
        .status(400)
        .json({ error: 'Appointment date is not available' });
    }

    /**
     * Create appointments
     */
    const appointments = await Appointments.create({
      user_id: req.userId,
      date: hoursStart,
      provider_id,
    });

    /**
     * Notify appointment provider
     */
    const user = await User.findByPk(req.userId);
    const formattedDate = format(
      hoursStart,
      "'dia' dd 'de' MMMM', às' H:mm'h'",
      { locale: pt }
    );

    await Notification.create({
      content: `Novo agendamento de ${user.name} para ${formattedDate}`,
      user: provider_id,
    });

    return res.json(appointments);
  }
}

export default new AppointmentController();
